"use client";

import React from "react";

interface PrivacyPolicyProps {
  onAccept?: () => void;
  onClose?: () => void;
  mode?: "modal" | "scroll";
}

const PRIVACY_SECTIONS = [
  {
    title: "Article 1 — Responsable du traitement",
    content: `Le responsable du traitement des données personnelles est Morali Pay, établissement de services financiers numériques immatriculé en République du Congo, dont le siège social est situé à Brazzaville.\n\nPour toute question relative à la présente Politique de Confidentialité, l'Utilisateur peut contacter le Délégué à la Protection des Données (DPO) via l'application Morali Pay ou à l'adresse de contact figurant dans la section Support.`,
  },
  {
    title: "Article 2 — Données personnelles collectées",
    content: `Morali Pay collecte les catégories de données suivantes :\n\n2.1 Données d'identification :\n— Nom, prénom(s), date de naissance\n— Numéro de téléphone (incluant le préfixe international +242)\n— Adresse email\n— Adresse de résidence\n— Pièce d'identité nationale ou passeport (dans le cadre du KYC)\n— Photographie (selfie biométrique)\n\n2.2 Données financières :\n— Solde du compte et historique des transactions\n— Données de carte bancaire (numéro masqué, date d'expiration)\n— Relevés d'épargne et opérations de crédit\n\n2.3 Données techniques et de connexion :\n— Adresse IP\n— Identifiants de session et tokens d'authentification\n— Type et modèle de l'appareil\n— Système d'exploitation et version de l'application\n— Localisation géographique approximative\n\n2.4 Données biométriques :\n— Empreinte digitale (si activée par l'Utilisateur)\n— Reconnaissance faciale (si activée par l'Utilisateur)\n\nLes données biométriques sont stockées exclusivement sur l'appareil de l'Utilisateur et ne sont jamais transmises aux serveurs de Morali Pay.`,
  },
  {
    title: "Article 3 — Finalités du traitement",
    content: `Les données personnelles sont traitées pour les finalités suivantes :\n\n3.1 Obligations légales et réglementaires :\n— Vérification d'identité (KYC/AML) conformément aux directives COBAC et GABAC\n— Lutte contre le blanchiment d'argent et le financement du terrorisme\n— Déclaration aux autorités de supervision (BEAC, COBAC, ANR Congo)\n\n3.2 Exécution du contrat :\n— Gestion et fonctionnement du Compte Morali\n— Traitement des transactions et virements\n— Émission et gestion des cartes de paiement\n— Gestion du service d'épargne\n— Support client et traitement des réclamations\n\n3.3 Intérêts légitimes de Morali Pay :\n— Sécurisation des transactions et prévention de la fraude\n— Amélioration et personnalisation des services\n— Analyse statistique anonymisée\n— Communication relative aux opérations sur le compte\n\n3.4 Consentement de l'Utilisateur :\n— Communications marketing (optionnel, désactivable)\n— Analyses d'usage anonymisées (optionnel, désactivable)`,
  },
  {
    title: "Article 4 — Base légale du traitement",
    content: `Le traitement des données repose sur les bases légales suivantes, conformément à la Loi n° 34-2018 relative à la protection des données personnelles en République du Congo :\n\n— Exécution du contrat de services financiers (art. 5)\n— Obligation légale (KYC/AML, déclarations réglementaires) (art. 6)\n— Consentement explicite de l'Utilisateur pour les traitements optionnels (art. 7)\n— Intérêt légitime de Morali Pay, sous réserve de ne pas porter atteinte aux droits de l'Utilisateur (art. 8)\n\nPour les traitements reposant sur le consentement, l'Utilisateur peut retirer son consentement à tout moment via les paramètres de confidentialité de l'application.`,
  },
  {
    title: "Article 5 — Durée de conservation",
    content: `Les données personnelles sont conservées selon les durées suivantes :\n\n5.1 Données d'identification : pendant toute la durée de la relation contractuelle, puis 10 ans après la clôture du compte (conformément aux obligations réglementaires COBAC).\n\n5.2 Données financières (historique des transactions) : 10 ans à compter de la réalisation de chaque opération (obligation de conservation documentaire).\n\n5.3 Données KYC (pièces d'identité, selfie) : 5 ans après la clôture du compte.\n\n5.4 Données de connexion et techniques : 24 mois maximum.\n\n5.5 Données biométriques : supprimées dès la désactivation de la biométrie sur l'appareil.\n\n5.6 Données de marketing : jusqu'au retrait du consentement.\n\nÀ l'issue de la période de conservation, les données sont supprimées ou anonymisées de manière irréversible.`,
  },
  {
    title: "Article 6 — Sécurité des données",
    content: `Morali Pay met en œuvre des mesures de sécurité techniques et organisationnelles appropriées pour protéger les données personnelles contre la destruction accidentelle ou illicite, la perte, l'altération, la divulgation ou l'accès non autorisé :\n\n6.1 Mesures techniques :\n— Chiffrement AES-256 au repos et TLS 1.3 en transit\n— Tokenisation des données de paiement\n— Authentification multi-facteurs (MFA)\n— Isolation des bases de données par environnement\n— Monitoring continu des accès et alertes en temps réel\n— Tests de pénétration réguliers par des tiers certifiés\n\n6.2 Mesures organisationnelles :\n— Formation obligatoire du personnel à la protection des données\n— Contrôle d'accès basé sur le principe du moindre privilège\n— Procédure de gestion des incidents de sécurité\n— Plan de continuité d'activité\n\n6.3 Hébergement :\nLes données sont hébergées sur des serveurs situés en Afrique Centrale, dans le respect de la souveraineté numérique de la République du Congo et des recommandations de l'ANSSI Congo.`,
  },
  {
    title: "Article 7 — Partage et transfert des données",
    content: `7.1 Morali Pay ne vend ni ne loue les données personnelles de l'Utilisateur à des tiers.\n\n7.2 Les données peuvent être partagées avec :\n— Réseau VISA (international) : données de transaction nécessaires à l'exécution des paiements\n— Opérateurs de télécommunications (MTN Congo, Airtel Congo) : pour le traitement des recharges\n— Autorités de supervision (BEAC, COBAC, GABAC, ANR Congo) : dans le cadre des obligations légales\n— Prestataires de services techniques (hébergement, sécurité) : sous accord de confidentialité\n\n7.3 Transfert international :\nEn cas de transfert hors de la République du Congo, Morali Pay s'assure que le destinataire offre un niveau de protection adéquat, conformément aux standards CEMAC. Le réseau VISA dispose de certifications PCI-DSS garantissant la sécurité des données de paiement.\n\n7.4 L'Utilisateur est informé que les données de paiement transitant par le réseau VISA peuvent être traitées dans des juridictions internationales conformément aux règles du réseau.`,
  },
  {
    title: "Article 8 — Droits de l'Utilisateur",
    content: `Conformément à la Loi n° 34-2018, l'Utilisateur dispose des droits suivants :\n\n8.1 Droit d'accès : obtenir la confirmation du traitement et une copie de ses données personnelles.\n\n8.2 Droit de rectification : demander la correction des données inexactes ou incomplètes.\n\n8.3 Droit à l'effacement : demander la suppression de ses données dans les conditions prévues par la loi (sauf obligation légale de conservation).\n\n8.4 Droit à la limitation : demander la limitation du traitement en cas de contestation de l'exactitude des données.\n\n8.5 Droit à la portabilité : recevoir ses données dans un format structuré et courant, ou demander leur transfert à un tiers.\n\n8.6 Droit d'opposition : s'opposer au traitement pour des raisons légitimes, y compris la prospection commerciale.\n\n8.7 Droit de retirer le consentement : à tout moment, sans que cela ne compromette la licéité du traitement antérieur.\n\n8.8 Exercice des droits :\nL'Utilisateur peut exercer ses droits via :\n— Les paramètres de confidentialité dans l'application\n— Le service client Morali Pay\n— Le Délégué à la Protection des Données (DPO)\nMorali Pay s'engage à répondre dans un délai de 30 jours calendaires.`,
  },
  {
    title: "Article 9 — Cookies et technologies de suivi",
    content: `9.1 Morali Pay n'utilise pas de cookies publicitaires.\n\n9.2 Les seuls cookies et technologies de suivi utilisés sont :\n— Cookies de session : nécessaires au fonctionnement de l'application\n— Tokens d'authentification : sécurisation de la connexion\n— Analyse anonymisée : agrégation statistique sans identification individuelle (optionnel)\n\n9.3 L'Utilisateur peut gérer ses préférences d'analyse dans les paramètres de confidentialité.`,
  },
  {
    title: "Article 10 — Protection des mineurs",
    content: `Morali Pay est réservé aux personnes physiques majeures (18 ans et plus) résidant en République du Congo ou dans un État membre de la CEMAC.\n\nMorali Pay ne collecte pas sciemment de données personnelles de mineurs. Si Morali Pay constate la collecte accidentelle de données d'un mineur, ces données seront supprimées dans les plus brefs délais.`,
  },
  {
    title: "Article 11 — Notification en cas de violation de données",
    content: `En cas de violation de données à caractère personnel susceptible d'engendrer un risque pour les droits et libertés de l'Utilisateur, Morali Pay s'engage à :\n\n— Notifier l'ANSSI Congo dans les 72 heures suivant la constatation\n— Informer l'Utilisateur par notification dans l'application et/ou par email\n— Documenter les circonstances, les effets et les mesures prises pour remédier à la violation\n\nLa notification à l'Utilisateur interviendra sans retard injustifié, conformément aux obligations de la Loi n° 34-2018.`,
  },
  {
    title: "Article 12 — Modifications de la politique",
    content: `Morali Pay se réserve le droit de modifier la présente Politique de Confidentialité pour tenir compte de l'évolution réglementaire, technologique ou opérationnelle.\n\nToute modification substantielle sera notifiée à l'Utilisateur :\n— Par notification dans l'application (au minimum 30 jours avant l'entrée en vigueur)\n— Par email à l'adresse de contact enregistrée\n\nL'utilisation continue de l'application après l'entrée en vigueur des modifications vaut acceptation de la nouvelle politique.\n\nL'Utilisateur est invité à consulter régulièrement la présente politique.`,
  },
  {
    title: "Article 13 — Contact",
    content: `Pour toute question relative à la protection de vos données personnelles ou pour exercer vos droits :\n\n📧 Délégué à la Protection des Données (DPO) :\nVia le formulaire Support dans l'application Morali Pay\n\n🏛️ Autorités de contrôle compétentes :\n— ANSSI Congo — Agence Nationale de Sécurité des Systèmes d'Information\n— Commission Nationale de l'Informatique et des Libertés\n\nDernière mise à jour : Janvier 2025\nVersion : 2.0 — Conforme Loi n° 34-2018 (Congo) et standards CEMAC`,
  },
];

export default function PrivacyPolicy({ onAccept, onClose, mode = "modal" }: PrivacyPolicyProps) {
  const [expanded, setExpanded] = React.useState<number | null>(null);

  const toggleSection = (idx: number) => {
    setExpanded((prev) => (prev === idx ? null : idx));
  };

  return (
    <div className="legal-doc">
      <div className="legal-doc-header">
        <div className="legal-doc-badge privacy-badge">PROTECTION DES DONNÉES</div>
        <h2 className="legal-doc-title">Politique de Confidentialité</h2>
        <p className="legal-doc-subtitle">
          Morali Pay — Gestion des données personnelles
          <br />
          Conforme Loi n° 34-2018 • ANSSI Congo • Recommandations CEMAC
        </p>
        <div className="legal-doc-line" />
      </div>

      <div className="legal-doc-preamble privacy-preamble">
        <p>
          <strong>ENGAGEMENT DE MORALI PAY</strong>
        </p>
        <p>
          Morali Pay s'engage à protéger la vie privée de ses utilisateurs et à traiter
          les données personnelles de manière transparente, licite et sécurisée. La présente
          politique décrit en détail les données collectées, les finalités du traitement,
          les droits des utilisateurs et les mesures de sécurité mises en œuvre.
        </p>
      </div>

      <div className="legal-doc-sections">
        {PRIVACY_SECTIONS.map((section, idx) => (
          <div key={idx} className="legal-section">
            <button
              className={`legal-section-header ${expanded === idx ? "expanded" : ""}`}
              onClick={() => toggleSection(idx)}
            >
              <span className="legal-section-title">{section.title}</span>
              <span className={`legal-section-arrow ${expanded === idx ? "rotated" : ""}`}>▾</span>
            </button>
            {expanded === idx && (
              <div className="legal-section-content">
                {section.content.split("\n\n").map((paragraph, pIdx) => (
                  <p key={pIdx}>
                    {paragraph.split("\n").map((line, lIdx) => (
                      <React.Fragment key={lIdx}>
                        {lIdx > 0 && <br />}
                        {line}
                      </React.Fragment>
                    ))}
                  </p>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="legal-doc-footer">
        <div className="legal-doc-line" />
        <p className="legal-doc-gov">
          Morali Pay — Protection des Données Personnelles
          <br />
          Loi n° 34-2018 • ANSSI Congo • Standards CEMAC
          <br />
          <span style={{ opacity: 0.5, fontSize: "10px" }}>
            République du Congo — Hébergement : Afrique Centrale — Chiffrement AES-256
          </span>
        </p>
        {mode === "modal" && onAccept && (
          <button
            className="legal-doc-accept privacy-accept"
            onClick={onAccept}
          >
            J'accepte la Politique de Confidentialité
          </button>
        )}
      </div>

      <style>{`
        .privacy-badge {
          background: rgba(59, 130, 246, 0.1) !important;
          border-color: rgba(59, 130, 246, 0.2) !important;
          color: #60a5fa !important;
        }
        .privacy-preamble {
          background: rgba(59, 130, 246, 0.04) !important;
          border-color: rgba(59, 130, 246, 0.1) !important;
        }
        .privacy-accept {
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(59, 130, 246, 0.08)) !important;
          color: #60a5fa !important;
          border-color: rgba(59, 130, 246, 0.25) !important;
        }
      `}</style>
    </div>
  );
}
