# Audit — Morali Pay (MOARLI Bank)

**Date :** 25 octobre 2026  
**Périmètre :** dépôt complet au commit `d2a7f4230ddbb6d8643b9c738bed402e9974f9dd` (`master`)  
**Version applicative :** `0.3.0` (`package.json`)  
**Nature :** revue statique du code, des règles Firestore, de la CI et de la documentation, plus exécution des contrôles automatisables. Aucun code applicatif n’a été modifié. Aucune exploitation active n’a été tentée.

## Synthèse exécutive

Morali Pay est une application bancaire Next.js 16 (App Router) dont le grand livre et l’identité reposent sur Firebase Auth et Cloud Firestore. Le dépôt contient un effort réel de durcissement (règles Firestore restrictives, claims admin, Zod sur une partie des routes, HMAC de webhook, en-têtes HTTP, bcrypt, CodeQL, Dependabot). Cet effort ne protège pas le cœur métier.

Un utilisateur authentifié peut **créditer son propre solde** sans mouvement d’argent externe, par au moins deux routes serveur qui passent par le Admin SDK et contournent donc les règles Firestore. Le jeton de réinitialisation de mot de passe **n’est pas lié à l’adresse e-mail** : un jeton obtenu pour un compte permet de remplacer le mot de passe d’un autre. Le déchiffrement des PIN, censé protéger les cartes, **échoue** (tests unitaires rouges) et la « ré-authentification » avant révélation se limite à l’âge du jeton, que le client rafraîchit sans ressaisie du mot de passe.

Le modèle de solde est double et contradictoire. L’interface écrit les soldes directement dans Firestore ; les règles versionnées interdisent ces écritures ; les API serveur réécrivent les mêmes soldes avec une autre sémantique (un dépôt « épargne » recrédite le cash). Selon que les règles sont déployées ou non, l’application est soit cassée, soit ouverte à la réécriture des soldes par le client. Le README ne demande pas de déployer `firestore.rules`.

La chaîne d’intégration continue ne peut pas s’installer : `package.json`, `bun.lock` et `package-lock.json` ont divergé. `npm ci` et `bun install --frozen-lockfile` échouent. Après installation non figée, le build et le typecheck passent, la suite Vitest a **2 échecs** sur le chiffrement des PIN, et ESLint remonte **36 erreurs**.

| Sévérité | Nombre |
|---|---|
| Critique | 5 |
| Haute | 12 |
| Moyenne | 16 |
| Basse | 10 |

**Priorité absolue :** fermer la création de monnaie, lier le jeton de reset à l’e-mail, faire du serveur l’unique auteur du grand livre, mettre à jour Next.js, et rendre la CI à nouveau exécutable.

## Méthode et résultats des contrôles

| Contrôle | Résultat |
|---|---|
| Lecture manuelle | 55 routes `src/app/api/**/route.ts`, `firestore.rules`, auth, OTP, PIN, webhooks, client (`MoraliApp.tsx` 8 322 lignes, `AdminDashboard.tsx` 3 162 lignes), CI, docs |
| `npm ci` | **Échec.** `package-lock.json` n’est plus aligné sur `package.json` (eslint, react, next, zod, tailwind, etc.) |
| `bun install --frozen-lockfile` (commande de la CI) | **Échec.** `bun.lock` figé, alors que `@tailwindcss/postcss` est passé de `^4` à `^4.3.0` dans `package.json` |
| `bun install` (non figé, hors dépôt) | Succès. Next résolu en **16.2.2**, déjà présent dans le `bun.lock` commité |
| `bun run build` | **Succès** (Next.js 16.2.2, 58 routes). Avertissement : la convention `middleware` est dépréciée au profit de `proxy` |
| `tsc --noEmit` | **Succès** |
| `vitest run` | **Échec.** 134 tests passés, **2 échecs** dans `src/lib/__tests__/pin-server-crypto.test.ts` (déchiffrement). 7 fichiers de tests, tous sous `src/lib`. Aucune route API n’est testée. Le rapport de couverture n’a pas été émis, la suite s’arrêtant sur l’échec |
| `eslint src` | **Échec** (code de sortie 2). 36 erreurs, 0 avertissement, 9 fichiers. Règles : `react-hooks/set-state-in-effect` (17), `react-hooks/refs` (9), `react-hooks/immutability` (9), `react-hooks/preserve-manual-memoization` (1) |
| `bun audit` (arbre résolu) | Nombreuses alertes. Critiques directement pertinentes : **Next.js 16.2.2** (plusieurs avis d’exécution de code à distance), **protobufjs &lt; 7.5.5** (via Firebase), **Sentry &lt; 10.75.2** (contournement de middleware si la route tunnel est utilisée — elle ne l’est pas ici). Le reste est surtout transitif (firebase-admin, grpc, undici, outils de dev) |
| `npm audit` sur le lock npm commité | 6 critiques, 33 hautes, 35 moyennes, 2 basses (76). Ce lock ne correspond plus à `package.json` ; le chiffre décrit l’artefact commité, pas l’arbre Bun |
| E2E Playwright | **Non exécutés** (navigateurs non installés). Lecture statique de `e2e/` : les assertions de sécurité sont trop lâches pour servir de filet |

## Constats critiques

### C1 — Création de monnaie par `POST /api/transactions/create`

**Fichiers :** `src/app/api/transactions/create/route.ts` (lignes 43–45, 117–152), `src/lib/validation.ts` (lignes 50–56, 78–91), `src/app/MoraliApp.tsx` (lignes 2349–2356, 2469–2516, 4359–4364, 5607)

Tout appelant authentifié peut envoyer un corps dont `type` vaut `depot`, avec `senderUid` et `recipientUid` égaux à son propre identifiant, et un `amount` jusqu’à 5 000 000 FCFA. La route crédite `moraliUsers/{uid}.balance` du montant, sans preuve de paiement mobile money, sans référence de prestataire, et sans débit d’un compte miroir. Les frais sont fournis par le client : un retrait peut partir avec `fees: 0`, donc la commission de 2 % annoncée dans l’interface n’est pas imposée par le serveur.

Le même crédit s’applique quand le client enregistre un dépôt d’épargne ou un change (`destination: "savings"` ou `"cash"`). Le serveur ignore la destination et ajoute le montant au solde cash. Trente requêtes par minute sont autorisées, et le limiteur n’est pas atomique (voir H6). Le plafond de 5 millions est donc un débit, pas une barrière.

**Impact :** émission illimitée de FCFA sur le grand livre, historique de transactions `success` falsifiable, revenus de frais contournables.

**Correction :** un dépôt ne crédite un solde qu’après une référence de paiement vérifiée (webhook signé, idempotente, plafond). Un retrait et un virement débitent dans la même transaction Firestore que l’écriture du mouvement. Les frais sont calculés côté serveur. Retirer `depot` de la liste des types acceptés par cette route tant que ce lien n’existe pas.

### C2 — Crédit en attente sans débit de l’émetteur

**Fichier :** `src/app/api/directory/pending-credit/route.ts` (POST lignes 104–143, plafond ligne 121 ; PUT lignes 271–310)

`POST` enregistre un document `pendingCredits` pour n’importe quel `recipientUid`, y compris celui de l’appelant, jusqu’à 50 000 000 FCFA, sans lire ni débiter le solde de l’émetteur. `PUT` crédite ensuite le destinataire du montant **lu dans le document**, puis marque le crédit `applied`. Le commentaire du PUT décrit un contrôle d’idempotence réel ; il ne compense pas l’absence de contrepartie à la création.

Le client (`MoraliApp.tsx` lignes 2364–2413) tente en plus d’incrémenter le solde dans le navigateur et de supprimer le document. Avec les règles actuelles cette écriture client est refusée, mais l’API `PUT` suffit à elle seule.

**Impact :** même famille que C1, avec un plafond dix fois plus haut et la possibilité de créditer un tiers (pollution de comptes, blanchiment apparent).

**Correction :** créer le crédit et débiter l’émetteur dans une seule transaction Firestore, refuser l’auto-crédit, plafonner, et n’appliquer le crédit qu’une fois. Supprimer le repli client qui réécrit le solde.

### C3 — Prise de compte : jeton de réinitialisation non lié à l’e-mail

**Fichiers :** `src/lib/otp-store.ts` (lignes 235–250, 258–277), `src/app/api/auth/reset-password/route.ts` (lignes 30–50), `src/app/api/auth/verify-reset-code/route.ts` (lignes 28–34)

`createResetToken(email)` ignore l’e-mail (`void normalizeKey(email)`). Le document Firestore et la mémoire ne stockent qu’une expiration. `consumeResetToken` vérifie que le jeton existe et n’est pas expiré. `POST /api/auth/reset-password` consomme ce jeton puis applique `newPassword` à l’e-mail **fourni dans le corps**, via `adminAuth.updateUser`.

Un jeton obtenu en validant l’OTP de son propre compte autorise donc le changement de mot de passe d’un autre compte. La suite dépend de la livraison de l’OTP (voir H4 et H5) : dès qu’un utilisateur légitime peut terminer le flux pour lui-même, il peut l’utiliser contre un autre.

**Impact :** prise de contrôle de compte, puis, avec C1/C2 et H1, vidage ou gonflement des soldes et lecture du PIN.

**Correction :** persister l’e-mail (ou son empreinte) avec le jeton, refuser la consommation si l’e-mail ne correspond pas, usage unique atomique, et révoquer les refresh tokens Firebase après le changement (`revokeUserTokens` existe déjà dans `src/lib/auth-verify.ts` et n’est pas appelé ici). Réponse identique que le compte existe ou non.

### C4 — Next.js 16.2.2 dans le périmètre d’avis critiques

**Fichiers :** `bun.lock` (entrée `next@16.2.2`), `package-lock.json` (`node_modules/next` en 16.2.3), `package.json` (`"next": "^16.1.1"`)

`bun audit` signale, pour la version résolue 16.2.2, plusieurs avis GitHub classés critiques, dont l’exécution de code à distance non authentifiée sur l’API d’optimisation d’images (AVIF, SVG) et dans `next/og` ImageResponse, ainsi que des avis hauts (contournement de middleware, déni de service, SSRF dans les rewrites et l’optimiseur). La configuration `next.config.ts` ne désactive pas l’optimiseur d’images. Le correctif publié se situe sur des versions 16.2.x / 16.3.x / 16.4.x plus récentes selon l’avis ; la CI ne lance aucun audit, donc cette dérive n’est pas bloquante.

**Impact :** compromission du processus Node qui détient le compte de service Firebase, donc de l’ensemble des soldes et des données KYC, si l’avis s’applique au déploiement.

**Correction :** monter Next.js au minimum qui ferme l’ensemble des avis critiques et hauts du 16.2.2, régénérer un seul lockfile, et faire échouer la CI sur `bun audit` (ou équivalent) pour les sévérités critique et haute des dépendances de production. Cet audit n’a pas cherché à déclencher ces avis.

### C5 — Le grand livre client contredit les règles, et le déploiement des règles n’est pas exigé

**Fichiers :** `firestore.rules` (lignes 32–34, `allow write: if false` sur `moraliUsers`), `src/app/MoraliApp.tsx` (lignes 2364–2371, 2420–2428, 2456–2467, 4345–4357, 5562–5605), `src/components/bank/AdminDashboard.tsx` (lignes 357–367, 687–721), `README.md` (installation, lignes 61–79)

Le client est l’auteur du solde : dépôt, retrait, épargne, change et traitement des crédits en attente font un `runTransaction` navigateur sur `moraliUsers`. Les commentaires parlent de règles ouvertes (« own doc — allowed by rules », « open read/write rules »). Le fichier `firestore.rules` interdit toute écriture client sur cette collection. Le guide d’installation ne contient pas `firebase deploy --only firestore:rules`.

Deux déploiements possibles, tous deux inacceptables pour une banque :

1. Règles versionnées déployées : les parcours de dépôt, retrait, épargne et change échouent dans l’interface, pendant que C1 et C2 restent exploitables via l’API.
2. Règles non déployées ou assouplies pour « faire marcher l’app » : la clé Firebase est publique (`NEXT_PUBLIC_*`). Tout client authentifié réécrit son document, y compris `balance`. Le login admin tente en plus d’écrire `role: "admin"` (H9).

**Impact :** soit indisponibilité des opérations, soit réécriture directe des soldes et élévation de privilège, selon l’état réel du projet Firebase. Le dépôt ne permet pas de savoir lequel est en production.

**Correction :** un seul chemin d’écriture, le Admin SDK, dans des transactions qui conservent la partie double. Interdire définitivement les champs `balance`, `role`, `savingsBalance`, `eurWallet`, `usdWallet` aux clients. Ajouter le déploiement des règles au runbook, et un test qui échoue si une règle autorise l’écriture de ces champs.

## Constats hauts

### H1 — La révélation du PIN ne redemande pas le mot de passe

**Fichiers :** `src/app/api/pin/reveal/route.ts` (lignes 12–14, 33–49, 66–71), `src/app/MoraliApp.tsx` (lignes 3252–3258), `SECURITY.md` (lignes 17–22)

La politique et le commentaire de la route exigent une preuve de ré-authentification et un champ mot de passe. Le code ne lit aucun mot de passe. Il refuse les jetons dont `iat` a plus de 60 secondes. `getIdToken(true)` renouvelle `iat` à partir du refresh token, sans mot de passe. Le PIN en clair est ensuite renvoyé dans le JSON (`pin`).

**Impact :** une session volée (XSS, appareil déverrouillé, jeton copié) suffit à lire le PIN carte. La promesse de sécurité publiée est fausse.

**Correction :** exiger une ré-authentification Firebase récente (`auth_time`, pas `iat`), ou un second facteur. Ne jamais renvoyer le PIN si le déchiffrement serveur est le seul contrôle. Préférer de ne pas stocker de copie déchiffrable (voir H3).

### H2 — Réinitialisation du PIN sans contrôle supplémentaire, copie chiffrée périmée

**Fichier :** `src/app/api/pin/reset/route.ts` (lignes 19–54)

Tout porteur d’un jeton d’accès peut remplacer le hash bcrypt. Aucun OTP, aucun PIN actuel, aucun `auth_time`. L’écriture est en `merge: true` et ne met pas à jour `serverEncryptedPin`. Après reset, la vérification bcrypt et la révélation peuvent diverger : l’ancien PIN reste déchiffrable, le nouveau est celui qui passe `verify-pin`.

Le stockage (`src/app/api/pin/store/route.ts` lignes 31–33 et 91–92) répond `success: true` quand le Admin SDK est absent ou quand l’écriture lève une erreur. L’utilisateur croit le PIN enregistré.

**Correction :** step-up identique à H1, remplacement complet du document (hash, chiffre, IV), échec explicite si l’écriture échoue.

### H3 — Le déchiffrement AES-GCM des PIN est cassé, clé de développement en dur

**Fichiers :** `src/lib/pin-server-crypto.ts` (lignes 60–76, 107–110, 119–139), `src/lib/__tests__/pin-server-crypto.test.ts` (lignes 24–29)

`encryptPinServerSide` préfixe `v1:` puis encode l’ensemble en base64. `decryptPinServerSide` interprète cette chaîne en UTF-8 et ne la décode en base64 que si elle **ne** ressemble **pas** à du base64. Le cas normal ne déchiffre donc pas. Les tests « decrypts an encrypted PIN » et « same PIN same UID » échouent : valeur obtenue `null`, attendue `1234`.

Hors production, la clé de repli est la constante `morali-dev-fallback-key-32bytes-ok!!`. La clé d’environnement, documentée comme 32 octets hexadécimaux (64 caractères), est tronquée aux 32 premiers caractères UTF-8 : l’entropie réelle est celle de l’hexadécimal ASCII, pas 256 bits.

**Impact :** la révélation « serveur » ne fonctionne pas ; un environnement dont `NODE_ENV` n’est pas `production` chiffre tous les PIN avec une clé publique dans le dépôt.

**Correction :** décoder le base64, tester le round-trip en CI, refuser de démarrer en production sans `MORALI_PIN_MASTER_KEY` de 32 octets décodés (hex ou base64), supprimer le repli. Envisager de ne plus stocker le PIN de façon réversible.

### H4 — Les OTP secrets sont écrits avec le SDK client, que les règles interdisent

**Fichiers :** `src/lib/otp-store.ts` (lignes 1–12, 83–94, 161–167), `firestore.rules` (lignes 157–167)

Le magasin d’OTP et les jetons de reset sont écrits via le SDK client (`NEXT_PUBLIC_*`), non authentifié côté serveur. Les règles interdisent `otpStore` et `resetTokenStore`. L’écriture Firestore échoue ; il ne reste que le `Map` mémoire du processus. Sur plusieurs instances (Vercel, modèle visé par les commentaires), l’OTP créé sur une instance est invisible pour celle qui vérifie. Si les règles sont ouvertes pour « réparer » ce choix, les codes deviennent lisibles par n’importe quel client, l’identifiant de document étant le téléphone ou l’e-mail.

**Impact :** réinitialisation de mot de passe et OTP e-mail/SMS peu fiables, ou, si les règles sont relâchées, lecture des codes et prise de compte (C3).

**Correction :** écriture et lecture exclusivement via le Admin SDK, documents illisibles par les clients, TTL, et liaison e-mail du jeton (C3).

### H5 — Le SMS OTP n’est jamais envoyé

**Fichier :** `src/app/api/sms/send-otp/route.ts` (lignes 7–14, 40–66)

Quand `SMS_API_KEY` est défini, le mode démo est coupé, un code est généré et stocké, puis la route répond succès. L’appel Twilio est commenté. Aucun SMS ne part. Sans fournisseur, hors production, la route renvoie le code fixe `111111` dans le JSON (`demoOtp`). `ALLOW_DEMO_OTP=true` réactive ce comportement même si `NODE_ENV=production`.

`POST /api/email/send-otp` et `POST /api/auth/send-reset-code` ont le même interrupteur de démo ; le second renvoie le code réel dans la réponse en mode démo (`send-reset-code/route.ts` lignes 39–46).

**Impact :** fonction d’authentification annoncée comme opérationnelle alors qu’elle ne délivre rien ; porte dérobée de configuration si le drapeau de démo fuit en production.

**Correction :** échouer tant que le fournisseur n’a pas accepté l’envoi. Interdire `ALLOW_DEMO_OTP` et `ALLOW_INSECURE_AUTH` au démarrage dès que l’environnement n’est pas un poste de développement local.

### H6 — Limiteur contournable, PIN à 4 chiffres

**Fichiers :** `src/lib/rate-limit.ts` (lignes 85–102, 149–156), `src/app/api/verify-pin/route.ts` (lignes 25–31, 60–62), `src/middleware.ts` (lignes 23–48, 100–108)

Le compteur Firestore est lu puis incrémenté hors transaction, et l’incrément est « fire-and-forget ». Des requêtes parallèles passent toutes. Le repli et toutes les routes non authentifiées (login admin, OTP, PIN) utilisent une mémoire locale par instance. L’identifiant est le premier `X-Forwarded-For`, que le client forge si le proxy ne l’écrase pas.

Le PIN a 10 000 valeurs. Le plafond affiché est de 5 essais par minute et par IP, en mémoire, avec un délai aléatoire (`Math.random`) qui ne compense pas l’absence de compteur durable par utilisateur. `/api/transfer/execute` ne consulte pas le PIN du tout.

**Impact :** essai exhaustif du PIN sur une session ; contournement des plafonds de virement, de dépôt (C1) et de login admin.

**Correction :** transaction Firestore (ou store central) par uid et par IP réelle fournie par la plateforme, verrou après N échecs, PIN refusé comme seul facteur d’une opération de paiement. Cesser d’utiliser `Math.random` pour la sécurité (`src/app/api/pay-links/route.ts` lignes 91–93, codes de lien de paiement).

### H7 — Virement : pas de PIN, identité d’affichage fournie par le client, transaction Firestore invalide si le profil manque

**Fichier :** `src/app/api/transfer/execute/route.ts` (lignes 67–104, 125–196, 200–214)

La route débite et crédite de façon atomique quand les deux documents existent : ce chemin est le plus sain du dépôt. Il reste incomplet pour une banque :

- aucun PIN, aucun `auth_time`, frais forcés à 0 ;
- `senderName` et `senderMoraliId` viennent du corps et sont enregistrés tels quels ;
- si le document émetteur n’existe pas, le code `set` puis `get` le destinataire. Firestore exige toutes les lectures avant les écritures : la transaction échoue ;
- si le destinataire n’existe pas, un `set` est suivi d’un `update` sur un document qui n’existait pas à la lecture : la transaction échoue aussi, après avoir été écrite comme si la création automatique fonctionnait ;
- un montant `0.4` passe le test `> 0` puis `Math.round` donne 0 : mouvement « réussi » de montant nul.

L’interface laisse passer l’opération sans PIN quand aucun PIN n’est enregistré (`MoraliApp.tsx` lignes 4417–4422).

**Correction :** refuser le virement sans profil serveur et sans step-up ; lire les noms dans `moraliUsers` ; séparer lectures et écritures ; rejeter un montant arrondi nul ; calculer les frais côté serveur.

### H8 — L’admin est un drapeau d’interface plus qu’une session

**Fichiers :** `src/app/api/admin/login/route.ts` (lignes 74–102), `src/components/bank/AdminDashboard.tsx` (lignes 303–378), `src/app/api/transactions/create/route.ts` (lignes 52–59), `src/app/api/notifications/create/route.ts` (lignes 33–50), `src/lib/auth-verify.ts` (lignes 231–256)

`/api/admin/login` compare un mot de passe unique (`ADMIN_PASSWORD_HASH`) et répond `{ success: true }` sans émettre de session ni poser de custom claim. La comparaison d’e-mail retourne avant bcrypt : oracle de timing sur l’adresse admin. Si l’appel réseau lève une exception, le client **continue** le login Firebase (lignes 319–325). Il tente ensuite `createUserWithEmailAndPassword`, puis `setDoc` de `role: "admin"` sur `moraliUsers`.

`requireAdmin` n’accepte que les claims. D’autres routes, dont la création de transactions et les notifications, acceptent encore `moraliUsers.role === "admin"`, alors que `auth-verify.ts` documente la suppression de ce repli comme dangereuse. Le jour où un propriétaire peut écrire son document (C5), il s’accorde ce rôle.

Le bootstrap (`src/app/api/admin/register/route.ts` lignes 47–70 et 99–106) vérifie `config/adminExists` hors transaction : deux requêtes parallèles peuvent créer deux admins. Le jeton de bootstrap est comparé avec `!==` et ses 8 derniers caractères sont écrits dans Firestore.

**Correction :** une identité admin = un compte Firebase + custom claim posé hors bande. Supprimer le mot de passe partagé, le fail-open, et tout contrôle d’autorisation basé sur un champ Firestore. Rendre le bootstrap atomique et effacer le secret de la base.

### H9 — Documents d’identité stockés en clair dans Firestore

**Fichiers :** `src/app/api/kyc/route.ts` (lignes 38–60), `src/app/api/admin/kyc-detail/route.ts` (lignes 39–55)

Recto, verso et selfie partent en base64 dans `kycRecords/{uid}` (jusqu’à 10 Mo par champ), avec numéro de document et date de naissance, sans chiffrement applicatif, sans bucket à accès restreint, sans durée de rétention. `merge: true` permet de réécraser un dossier déjà revu. La collection `kycRecords` n’apparaît pas dans `firestore.rules` (le refus par défaut s’applique **si** les règles sont déployées). L’endpoint d’admin renvoie les images en JSON.

Les conditions générales (`src/components/bank/LegalTerms.tsx`, section 4) annoncent authentification multi-facteurs, AES-256 généralisé et tokenisation des cartes. Le produit n’a pas de MFA, et le PAN/PIN n’est pas tokenisé auprès d’un émetteur.

**Impact :** fuite massive de pièces d’identité si le compte de service, un export admin ou des règles ouvertes sont compromis. Écart avec la Loi n° 33-2018 citée dans les mêmes conditions.

**Correction :** stockage objet privé, chiffrement, accès admin audité, minimisation de la réponse, machine à états du dossier KYC. Aligner le texte juridique sur les contrôles réels.

### H10 — Le service worker met en cache les réponses API

**Fichier :** `public/sw.js` (lignes 37–39, 83–95, 126–141)

Toute réponse API GET réussie est copiée dans Cache Storage (`networkFirst`). Soldes, listes d’opérations et données de profil restent sur l’appareil après déconnexion. Le clic sur une notification ouvre `data.url` sans liste d’hôtes autorisés.

**Correction :** ne jamais mettre en cache `/api/`, purger le cache à la déconnexion, n’ouvrir que des URL de même origine.

### H11 — Autorisation « locale » qui accepte des claims non signés

**Fichier :** `src/lib/auth-verify.ts` (lignes 5, 96–129, 132–193, 254–256)

`verifyTokenLocal` ne vérifie pas la signature. Il n’est actif que si `NODE_ENV !== "production"` **et** `ALLOW_INSECURE_AUTH=true`. Dans ce mode, `extractJwtPayloadClaims` recopie les claims du payload, et `requireAdmin` accepte `admin === true` ou `role === "admin"`. L’identifiant de projet `banque-digitale` est en dur : il sert d’émetteur attendu et révèle le projet Firebase.

**Impact :** tout déploiement dont `NODE_ENV` n’est pas exactement `production` (staging, oubli, valeur `Production`) devient une élévation admin si le drapeau est vrai. Le drapeau est documenté comme bloqué en production ; le risque est une erreur de configuration, fréquente.

**Correction :** supprimer le mode. Les tests doivent passer par le vérifieur Admin SDK ou un émulateur. Lire le project id depuis l’environnement.

### H12 — Frais de tenue de compte non idempotents, solde négatif autorisé

**Fichier :** `src/app/api/account/maintenance/route.ts` (lignes 107–163, 217–228)

Le nombre de frais déjà pris est compté **avant** la transaction qui débite, et les écritures `bankRevenue` sont faites après. Deux appels parallèles (le limiteur de H6 ne les sérialise pas) facturent deux fois. Le commentaire autorise explicitement un solde négatif. Il n’y a pas de clé d’idempotence par mois : `MAINT-${Date.now()}` change à chaque appel.

**Correction :** une transaction qui relit le compteur de mois déjà facturés, refuse le découvert ou le plafonne par une politique explicite, et utilise une clé `uid + mois`.

## Constats moyens

### M1 — Taux de change inversé dès que la base n’est pas XAF ou EUR

**Fichier :** `src/app/api/exchange-rate/route.ts` (lignes 17–18, 48–57)

Frankfurter exprime « 1 EUR = rates[devise] ». Le code utilise `rates[from]` comme si c’était « 1 unité de `from` = x EUR », sauf pour EUR et XAF qui sont traités à part. Un appel `from=USD&to=XAF` surévalue le dollar d’un facteur proche du cours EUR/USD. Les paires XAF→EUR et XAF→USD utilisées par l’écran principal tombent dans le cas particulier et sont cohérentes avec le peg 655,957. Le cache est un objet mémoire par instance, sans timeout sur le `fetch`.

### M2 — Objectifs d’épargne déconnectés du solde, message de restitution faux

**Fichier :** `src/app/api/goals/route.ts` (lignes 125–136, 184–194, 206–216)

`PATCH action=add` augmente `currentAmount` sans débiter `moraliUsers`. `DELETE` répond que les FCFA sont « restitués » et renvoie `refundedAmount` sans créditer aucun compte. `verifyAuth` appelle `getAuth()` du Admin SDK directement, pas `getAdminAuth()` de `src/lib/auth-verify.ts` : la route dépend d’une initialisation faite par une autre route. `sanitize()` est appliqué à l’identifiant de document.

### M3 — Historique incomplet et identifiants de reçu trop courts

**Fichiers :** `src/app/api/transactions/list/route.ts` (lignes 50–63), `src/app/MoraliApp.tsx` (lignes 2474, 2515, reçus `TX-` + 8 chiffres)

La liste API ne lit que `serverTransactions`. Les dépôts et retraits sont écrits dans `transactions`. L’écran s’appuie sur un listener client, l’API sur l’autre collection. Le verrou d’idempotence (`txLocks/receiptLock_*`) est global, pas par utilisateur ; deux opérations dans la même milliseconde partagent les 8 derniers chiffres de `Date.now()`.

### M4 — Webhook de paiement : plafond absent, charge utile brute, pas de lien d’identité

**Fichier :** `src/app/api/webhooks/payment/route.ts` (lignes 108–197, 243–249)

La signature HMAC-SHA256 et la comparaison à temps constant sont en place, et le doublon est détecté par `reference`. Il n’y a pas de plafond de montant, pas de fenêtre temporelle, pas de contrôle que `userId` possède le `phone` ou le `moraliId`. `rawPayload` est stocké tel quel (numéros, éventuellement plus). `GET` révèle si le secret est configuré. `reference` sert d’identifiant de document sans contrôle de longueur ni de caractères.

### M5 — Classement et revenus déclaratifs

**Fichiers :** `src/app/api/leaderboard/route.ts` (lignes 83–109, 168–198), `src/app/api/revenue/track/route.ts` (lignes 32–79)

Tout utilisateur authentifié fixe son score, son `savingsTotal` et ses succès, et ces chiffres sont visibles avec l’`uid`. Le paramètre `page` est lu et ignoré. Tout utilisateur peut aussi insérer des lignes `bankRevenue` du montant de son choix : les rapports d’admin et les frais de tenue de compte (H12) s’appuient sur cette collection.

### M6 — Export admin non borné

**Fichier :** `src/app/api/admin/fetch-data/route.ts` (lignes 32–42)

Un GET charge toute la collection `moraliUsers` et toutes les transactions, documents complets, sans pagination ni sélection de champs. Même schéma pour plusieurs resets (`src/app/api/admin/reset-all/route.ts` lignes 90–116, suppressions une à une ; `src/app/api/admin/log/route.ts` lignes 124–136, un seul batch pour tous les soldes, alors que la limite Firestore est 500).

**Impact :** temps de réponse et mémoire qui croissent avec le livre ; reset partiel ; timeout. Un jeton admin volé emporte l’annuaire et les soldes en un appel.

### M7 — Dérive règles / collections réellement utilisées

**Fichier :** `firestore.rules`

Le refus par défaut ferme ce qui n’est pas listé. C’est sain **si** le fichier est déployé. Plusieurs collections écrites par l’application n’ont pas de match explicite : `kycRecords`, `directory`, `directoryLookup`, `webhookPayments`, `config`, `adminActivity`, `adminConfirmTokens`, `leaderboard`, `chats`, `users/{uid}/paylinks`, `users/{uid}/meta`, `users/{uid}/goals`, `users/{uid}/budget`, `serverNotifications`. Une future règle fourre-tout les ouvrirait toutes.

La création de `accountDeletionRequests` (lignes 220–225) appelle `resource.data` et `diff` sur un document qui n’existe pas encore : la règle échoue toujours. L’API passe par le Admin SDK, donc le symptôme est invisible, et la règle ne protège rien.

`isRecentAuth()` (lignes 19–22) n’est référencé nulle part.

### M8 — En-têtes et CSP incohérents

**Fichiers :** `src/middleware.ts` (lignes 57–90, 134–137), `src/app/layout.tsx` (lignes 53–56), `next.config.ts` (lignes 16–50)

Le middleware pose un nonce CSP puis reconstruit la réponse. Le script inline du service worker dans `layout.tsx` utilise `dangerouslySetInnerHTML` **sans** nonce, alors que le commentaire du middleware affirme qu’il n’y a aucun `dangerouslySetInnerHTML`. Ce script est statique (pas une XSS directe) ; la CSP l’empêche de s’exécuter, donc l’enregistrement du service worker est peu fiable.

`Permissions-Policy` du middleware coupe la caméra sur toutes les routes, y compris le scan QR, et contredit `next.config.ts`. `X-DNS-Prefetch-Control` est `on` dans le middleware et `off` dans la config. `X-XSS-Protection: 1; mode=block` est obsolète. HSTS est déclaré deux fois avec deux `max-age`.

### M9 — Qualité des tests et de la CI

**Fichiers :** `.github/workflows/ci.yml`, `e2e/api-security.spec.ts` (lignes 16–34, 79–91), `package.json` (script `lint`)

- La CI installe avec `--frozen-lockfile` : elle échoue avant lint, tests et build (voir le tableau des contrôles).
- Deux lockfiles (`bun.lock`, `package-lock.json`) divergent de `package.json` et entre eux.
- `eslint src --max-warnings 1000` ne neutralise pas les erreurs : avec la config résolue, le job lint est rouge (36 erreurs `react-hooks`).
- Aucun job `audit`, aucun seuil de couverture. CodeQL (`.github/workflows/codeql.yml`) ne tourne que sur `master`, pas sur `main`, et n’active pas `security-extended`.
- Les E2E de « rate limiting » acceptent l’absence de HTTP 429. La protection admin accepte 500 et 503. Les tests visent `/api/auth/login` et `/api/auth/register`, qui n’existent pas. Aucun test ne couvre C1, C2 ou C3.
- Dependabot est présent (`.github/dependabot.yml`) et ignore les montées majeures de Next, React et React-DOM, ce qui peut laisser passer le correctif de C4 s’il est publié en majeur.

### M10 — Mode démo et journaux

Le mode démo OTP est détaillé en H5. En complément, `captureError` joint aux événements Sentry des `extra` qui contiennent montants, `receiptId` et identifiants (`transactions/create/route.ts` ligne 205). Le webhook journalise les 8 premiers caractères de la signature calculée (`webhooks/payment/route.ts` lignes 84–88). Ce ne sont pas des secrets complets ; ce sont des données financières et des indices cryptographiques dans un outil tiers.

### M11 — Recherche d’annuaire et données personnelles

**Fichier :** `src/app/api/directory/search/route.ts` (lignes 17–29, 82–98)

La recherche par préfixe de pseudo (3 documents lus, 1 renvoyé) permet de sonder l’annuaire. L’`uid` Firebase est renvoyé à tout utilisateur authentifié. Le téléphone est masqué (2 derniers chiffres). Le repli client interroge `moraliUsers` en direct (`MoraliApp.tsx` vers les lignes 2290–2304) : avec les règles actuelles la requête est refusée ; sans elles, elle renvoie le document entier.

### M12 — Bundle et coût Firestore

`MoraliApp.tsx` (8 322 lignes) et `AdminDashboard.tsx` (3 162 lignes) concentrent l’UI, le grand livre et l’admin. Chaque appel métier paie une lecture de rate-limit. Les images KYC de plusieurs mégaoctets sont des documents Firestore (facturation et latence). `next-pwa` est dépendant mais n’est pas branché dans `next.config.ts` ; le service worker est manuel. Le build produit néanmoins un artefact cohérent (58 routes dynamiques).

### M13 — Login admin : énumération et absence de session

Déjà couvert pour l’essentiel par H8. Point complémentaire : `GET /api/admin/check-exists` et `GET /api/admin/config` indiquent si un admin ou un e-mail d’admin est configuré. C’est moins grave que l’ancienne fuite de l’e-mail, que les commentaires disent avoir retirée. Le rate-limit de ces routes reste celui de H6.

### M14 — Change de devises entièrement client

**Fichier :** `src/app/MoraliApp.tsx` (lignes 5550–5613)

EUR et USD vivent dans `eurWallet` / `usdWallet` du document utilisateur, mis à jour par le client. Aucune API ne conserve la position de change de la banque. Combiné à C5, soit l’opération échoue, soit l’utilisateur fixe ses devises. Le dépôt d’historique qui suit rappelle C1.

### M15 — Routes qui répondent succès en cas d’échec

Outre le stockage de PIN (H2), `POST /api/notifications/create` répond `success: true` dans le `catch` (lignes 93–96) et `POST /api/revenue/track` répond `success: false, fallback: true` sans code d’erreur stable. L’interface continue comme si l’opération avait eu lieu.

### M16 — Documentation de sécurité en avance sur le code

`SECURITY.md` affirme : mots de passe jamais en clair (le reset et le PIN reçoivent le secret en clair sur TLS, ce qui est normal, mais le PIN est ensuite conservé déchiffrable), révélation du PIN après mot de passe (H1), Zod sur toutes les routes (beaucoup parsent le JSON à la main : admin, transfert, webhook, KYC, notifications), rate-limit Firestore sur les routes sensibles (H6), OTP e-mail obligatoire à l’inscription. `.secrets-rotation.md` est daté du 7 juin 2026, avec des échéances `[DATE]` non renseignées. Au 25 octobre 2026, le cycle de 90 jours annoncé est dépassé, et le document dit encore que `ADMIN_BOOTSTRAP_TOKEN` devrait être supprimé.

## Constats bas

### B1 — Santé et empreinte

`GET /api/health` (`src/app/api/health/route.ts` lignes 14–18) expose version et état base. Utile pour l’exploitation, à réserver au réseau interne. `GET /api/webhooks/payment` expose `hmacEnabled` et la liste des prestataires.

### B2 — En-têtes dupliqués

`X-Content-Type-Options` est posé deux fois dans `next.config.ts` (lignes 25 et 31). `X-XSS-Protection` peut être retiré.

### B3 — `init-role` ne fait pas ce que le commentaire dit

`src/app/api/admin/init-role/route.ts` (lignes 12–16 et 35) exige déjà un admin, puis réécrit le rôle **de l’appelant**, pas d’un autre compte. Pas d’élévation supplémentaire tant que `requireAdmin` tient. Le commentaire induit en erreur.

### B4 — Politique de mot de passe

`src/lib/validation.ts` lignes 66–69 : 8 caractères minimum, pas de contrôle de composition ni de mots de passe compromis. Acceptable comme dette, insuffisant pour un compte de paiement.

### B5 — README incomplet par rapport au produit

Le README décrit Twilio comme SMS opérationnel, omet budget, objectifs, liens de paiement, chat, classement, tontines côté API, et ne documente pas le déploiement des règles ni l’écart Bun / npm. La section « Getting Started » ne peut pas être suivie tant que les lockfiles sont cassés (M9).

### B6 — Code mort et dépendances

`isRecentAuth` dans les règles ; `next-pwa` non branché ; schéma Zod `transactionCreate.status` accepté puis ignoré (le serveur force `success`, ce qui est bien, mais le champ laisse croire le contraire).

### B7 — Délai anti-timing du PIN

`src/app/api/verify-pin/route.ts` lignes 60–62 : `100 + Math.random() * 200`. bcrypt domine déjà le temps quand le hash existe ; le délai aléatoire ne couvre pas le cas « document absent » de façon uniforme et utilise un PRNG non cryptographique.

### B8 — Projet Firebase en dur

`src/lib/auth-verify.ts` ligne 5 : `banque-digitale`. À lire depuis la configuration, surtout si le mode H11 reste temporairement.

### B9 — Accessibilité et perf React

Les 36 erreurs ESLint sont des `setState` synchrones dans des effets et des refs mutées pendant le rendu. Ce n’est pas une faille, c’est une dette qui rend le lint inutilisable comme gate et peut provoquer des rendus en cascade sur mobile, cible déclarée du produit.

### B10 — Middleware Next.js déprécié

Le build avertit que `src/middleware.ts` doit migrer vers `proxy`. À planifier avec la montée de Next.js (C4), pas avant d’avoir figé le comportement des en-têtes.

## Ce qui tient

- `requireAdmin` s’appuie sur des custom claims, que le client ne peut pas forger quand le jeton est vérifié par le Admin SDK.
- Les règles versionnées refusent par défaut les écritures de soldes, de PIN, d’OTP et de transactions, et rendent les journaux d’audit non modifiables par le client.
- Le webhook exige un HMAC avant tout crédit, avec comparaison à temps constant.
- Les mots de passe admin sont un hash bcrypt côté serveur, pas une variable `NEXT_PUBLIC_`.
- `.gitignore` exclut `.env*`, `*.pem` et `service-account-key.json`. La recherche dans l’arbre versionné n’a pas trouvé de clé privée réelle ni de secret de production (les occurrences sont des placeholders et des tests).
- `GET /api/transactions/list` et plusieurs lectures (budget, notifications, liens de paiement) prennent l’uid du jeton.
- HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options`, `frame-ancestors 'none'`, `poweredByHeader: false` sont présents.
- Le typecheck strict passe et le build de production se termine.
- Dependabot et un workflow CodeQL existent.

## Plan de remédiation

### P0 — Avant tout trafic réel

1. Désactiver le crédit de `balance` dans `POST /api/transactions/create` pour `depot`, et le `POST`/`PUT` de `pending-credit`, jusqu’à ce qu’une contrepartie soit débitée dans la même transaction Firestore (C1, C2).
2. Lier le jeton de reset à l’e-mail, le consommer atomiquement, révoquer les sessions, et unifier la réponse (C3).
3. Déployer `firestore.rules` tel que versionné, et vérifier en production qu’un client ne peut pas `setDoc` son solde ni son `role` (C5). Ne pas ouvrir les règles pour débloquer l’UI.
4. Monter Next.js hors des avis critiques du 16.2.2, et `protobufjs` au-delà de 7.5.4 (C4).
5. Retirer `ALLOW_DEMO_OTP` et `ALLOW_INSECURE_AUTH` des environnements partagés ; confirmer `NODE_ENV=production` (H5, H11).

### P1 — Contrôles d’accès et secrets

6. Step-up (`auth_time` ou mot de passe) sur révélation de PIN, reset de PIN, virement, reset global (H1, H2, H7).
7. Réparer ou supprimer le chiffrement réversible des PIN ; interdire la clé de repli ; faire passer le test de round-trip en CI (H3).
8. OTP et jetons uniquement via Admin SDK (H4). Brancher réellement le SMS ou échouer (H5).
9. Limiteur atomique par uid, IP fournie par la plateforme, verrou de PIN (H6).
10. Supprimer le rôle Firestore comme source d’autorisation, le mot de passe admin partagé, le fail-open du login, et l’auto-écriture `role: "admin"` (H8).
11. Sortir le KYC de Firestore vers un bucket privé (H9). Ne plus cacher `/api/` (H10).

### P2 — Intégrité fonctionnelle et ingénierie

12. Un service de grand livre unique : dépôt, retrait, virement, épargne, change, frais de tenue, objectifs. Le client ne fait qu’afficher.
13. Idempotence des frais de tenue et interdiction du découvert non spécifié (H12). Corriger l’inversion de taux hors peg (M1). Aligner les collections lues par l’historique (M3).
14. Plafond, schéma et rétention du webhook (M4). Classement et revenus calculés par le serveur (M5). Pagination de `fetch-data` (M6).
15. Un seul lockfile. `bun install --frozen-lockfile` doit passer. ESLint doit échouer la CI sur les 36 erreurs, ou celles-ci doivent être corrigées. Ajouter des tests d’intégration qui refusent : dépôt sans paiement, reset avec un jeton d’un autre e-mail, écriture client de `balance`, round-trip PIN.
16. Job d’audit de dépendances bloquant sur critique/haute en production.

### P3 — Dette et conformité

17. Découper `MoraliApp.tsx` et `AdminDashboard.tsx`.
18. Réécrire `SECURITY.md`, le README (déploiement des règles, SMS réellement absent) et le calendrier de rotation.
19. MFA pour les paiements et l’admin, politique de mot de passe, texte juridique aligné.
20. Migrer `middleware` vers `proxy` en même temps que la montée Next.js, et unifier les en-têtes.

## Limites

- Pas d’accès au projet Firebase, à Vercel ni aux secrets : impossible de dire si `firestore.rules` est déployé, si `NODE_ENV` et les drapeaux de démo sont corrects, ni si des données réelles existent déjà.
- Pas de test d’intrusion dynamique, pas d’essai des avis Next.js, pas d’exécution Playwright.
- `bun audit` compte des transitive de développement (`firebase-tools`, ESLint) ; les avis cités en C4 et H sont ceux qui touchent le runtime de production.
- L’installation utilisée pour build, tests et audit a été faite sans `--frozen-lockfile`, parce que le lock commité ne s’installe plus. Les numéros de version cités pour Next (16.2.2) sont ceux du `bun.lock` commité, pas un effet de cette réinstallation.
