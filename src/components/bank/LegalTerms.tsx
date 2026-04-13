"use client";

import React from "react";

interface LegalTermsProps {
  onAccept?: () => void;
  onClose?: () => void;
  mode?: "modal" | "scroll";
}

const LEGAL_SECTIONS = [
  {
    title: "Article 1 — Objet et champ d'application",
    content: `Les présentes Conditions Générales d'Utilisation (ci-après « CGU ») régissent les relations entre Morali Pay, société de services financiers numériques immatriculée en République du Congo, et tout utilisateur (ci-après « l'Utilisateur » ou « le Client ») accédant à l'application mobile Morali Pay et aux services associés.\n\nL'Utilisation de l'application Morali Pay implique l'acceptation pleine et entière des présentes CGU. Morali Pay se réserve le droit de modifier ces conditions à tout moment, sous réserve d'une notification préalable de 30 jours calendaires adressée à l'Utilisateur via l'application ou par email.`,
  },
  {
    title: "Article 2 — Définitions",
    content: `« Compte Morali » : espace financier numérique ouvert au nom de l'Utilisateur permettant d'effectuer des opérations de paiement, de transfert et de gestion de moyens de paiement.\n\n« Service » : l'ensemble des fonctionnalités offertes par l'application Morali Pay, incluant mais sans s'y limiter : les virements, les paiements marchands, les recharges téléphoniques, l'épargne numérique et l'émission de cartes virtuelles.\n\n« Moyens de paiement » : les cartes virtuelles VISA, les soldes de compte et tout autre instrument de paiement émis par Morali Pay.\n\n« KYC » (Know Your Customer) : procédure de vérification d'identité conforme aux directives de la COBAC et de la BEAC.\n\n« Transaction » : toute opération de débit, de crédit, de virement ou de paiement initiée via l'application.\n\n« PIN » : code personnel à 4 chiffres utilisé pour sécuriser les opérations sensibles.`,
  },
  {
    title: "Article 3 — Ouverture et fonctionnement du compte",
    content: `3.1 L'ouverture d'un Compte Morali est subordonnée à :\n— La fourniture d'informations exactes et à jour (identité complète, numéro de téléphone, adresse email)\n— La validation de l'identité par procédure KYC conforme aux exigences de la COBAC\n— L'acceptation des présentes CGU et de la Politique de Confidentialité\n\n3.2 Morali Pay se réserve le droit de :\n— Refuser l'ouverture d'un compte sans motif exprès, dans le respect de la réglementation en vigueur\n— Suspendre ou clôturer un compte en cas de non-respect des présentes CGU\n— Demander la mise à jour des informations d'identité à tout moment\n\n3.3 Le Compte Morali est strictement personnel et incessible. Toute cession, même gratuite, est interdite.`,
  },
  {
    title: "Article 4 — Sécurité et authentification",
    content: `4.1 L'Utilisateur est seul responsable de la confidentialité de ses identifiants de connexion, mot de passe, code PIN et de toutes les informations d'authentification biométrique.\n\n4.2 Morali Pay met en œuvre des mesures de sécurité techniques et organisationnelles conformes aux standards internationaux (authentification multi-facteurs, chiffrement AES-256, tokenisation des données de carte).\n\n4.3 En cas de perte, vol ou soupçon de compromission de ses identifiants, l'Utilisateur s'engage à :\n— Modifier immédiatement son mot de passe\n— Activer le verrouillage de ses cartes\n— Notifier Morali Pay via le support client dans les plus brefs délais\n\n4.4 Toute opération validée avec les identifiants de l'Utilisateur (mot de passe, PIN, biométrie) est réputée initiée par celui-ci et lui est imputable, conformément aux dispositions de l'article 10 de la Loi n° 33-2018 relative à la protection du consommateur en République du Congo.`,
  },
  {
    title: "Article 5 — Opérations et transactions",
    content: `5.1 Morali Pay effectue les opérations demandées par l'Utilisateur dans la limite des plafonds définis pour son profil et le type de carte détenu.\n\n5.2 Les plafonds applicables sont :\n— Carte Essentielle : 200 000 FCFA/mois, 50 000 FCFA/transaction\n— Carte Black : 5 000 000 FCFA/mois, 1 000 000 FCFA/transaction\n— Virements : plafond journalier configurable dans les paramètres de sécurité\n\n5.3 Morali Pay se réserve le droit de bloquer, différer ou refuser toute transaction :\n— Suspecte de fraude ou de blanchiment d'argent (conformément à la réglementation GABAC/BEAC)\n— Excédant les plafonds autorisés\n— En contradiction avec les sanctions internationales applicables\n\n5.4 Les transactions sont irrévocables une fois confirmées, sauf en cas d'erreur technique prouvée ou d'opération frauduleuse dûment constatée.\n\n5.5 Les frais applicables à chaque type d'opération sont communiqués dans la section « Tarifs » de l'application et peuvent être modifiés sous réserve d'un préavis de 30 jours.`,
  },
  {
    title: "Article 6 — Moyens de paiement — Cartes virtuelles",
    content: `6.1 Morali Pay émet des cartes de paiement virtuelles de type VISA, soumises aux conditions générales du réseau de paiement international.\n\n6.2 L'utilisation des cartes est strictement réservée aux opérations licites conformes à la réglementation de la République du Congo et de la CEMAC.\n\n6.3 L'Utilisateur peut :\n— Activer/désactiver temporairement sa carte (gel instantané)\n— Configurer les restrictions d'utilisation (paiements en ligne, transactions internationales)\n— Modifier les plafonds de dépenses dans la limite autorisée\n— Demander le renouvellement ou la révocation de sa carte\n\n6.4 En cas de fraude avérée sur une carte, Morali Pay procédera au remboursement dans un délai maximum de 30 jours ouvrables après examen du dossier, conformément aux directives COBAC sur la protection des usagers des services financiers.`,
  },
  {
    title: "Article 7 — Services d'épargne",
    content: `7.1 Le service d'épargne Morali Pay offre un placement à taux annuel de 4,5 % (quatre virgule cinq pour cent), soumis aux conditions suivantes :\n— Le taux est indicatif et peut être ajusté en fonction des conditions de marché\n— Les intérêts sont calculés quotidiennement et capitalisés mensuellement\n— Le retrait des fonds épargnés est disponible à tout moment, sans frais de pénalité\n\n7.2 Les fonds déposés sur le compte d'épargne bénéficient d'une garantie de sécurité conformément à la réglementation COBAC relative à la protection des déposants.\n\n7.3 L'Utilisateur est informé que l'épargne numérique ne constitue pas un dépôt bancaire garanti par un fonds de garantie des dépôts au sens de la directive CEMAC.`,
  },
  {
    title: "Article 8 — Protection contre le blanchiment et le financement du terrorisme",
    content: `8.1 Morali Pay est tenu de respecter la réglementation relative à la lutte contre le blanchiment d'argent et le financement du terrorisme (LAB/FT), conformément à :\n— La Loi n° 33-2018 portant lutte contre le blanchiment en République du Congo\n— Les directives du Groupe d'Action contre le Blanchiment en Afrique Centrale (GABAC)\n— La réglementation de la BEAC relative aux devoirs de vigilance\n\n8.2 Morali Pay se réserve le droit de :\n— Demander des informations complémentaires sur l'origine ou la destination des fonds\n— Signaler toute transaction suspecte aux autorités compétentes (ANR, BEAC)\n— Geler temporairement les fonds en attente d'investigation\n\n8.3 Le refus de coopérer aux demandes de renseignement légitimes entraînera la suspension du compte.`,
  },
  {
    title: "Article 9 — Responsabilité",
    content: `9.1 Responsabilité de Morali Pay :\n— Assurer la disponibilité du service 24h/24, 7j/7, sous réserve de interruptions de maintenance planifiées\n— Exécuter les ordres de l'Utilisateur avec diligence et dans les meilleurs délais\n— Garantir la sécurité des données et des transactions conformément aux standards en vigueur\n— En cas d'interruption non planifiée supérieure à 4 heures, informer les utilisateurs dans les meilleurs délais\n\n9.2 Responsabilité de l'Utilisateur :\n— Maintenir la confidentialité de ses identifiants\n— Vérifier régulièrement le solde et l'historique des transactions\n— Signaler toute opération non autorisée dans les 60 jours suivant la constatation\n— Utiliser le service conformément aux lois et réglementations applicables\n\n9.3 Force majeure :\nMorali Pay ne saurait être tenue responsable des interruptions dues à des cas de force majeure : catastrophes naturelles, pandémies, conflits armés, pannes d'infrastructure nationale, décisions des autorités réglementaires.`,
  },
  {
    title: "Article 10 — Données personnelles et vie privée",
    content: `Le traitement des données personnelles est régi par la Politique de Confidentialité de Morali Pay, accessible via l'application. Morali Pay s'engage à respecter :\n— La Loi n° 34-2018 relative à la protection des données personnelles en République du Congo\n— Les recommandations de l'ANSSI Congo (Agence Nationale de Sécurité des Systèmes d'Information)\n— Les principes de la Déclaration de l'Union Africaine sur la protection des données\n\nLes données sont hébergées sur des serveurs situés en Afrique Centrale, dans le respect de la souveraineté numérique de la République du Congo.`,
  },
  {
    title: "Article 11 — Réclamations et litiges",
    content: `11.1 Toute réclamation doit être adressée au service client Morali Pay :\n— Via le formulaire de support intégré à l'application\n— Par email à l'adresse de support indiquée dans l'application\n\n11.2 Morali Pay s'engage à accuser réception de toute réclamation dans un délai de 48 heures ouvrables et à fournir une réponse motivée dans un délai de 15 jours ouvrables.\n\n11.3 En cas de litige non résolu par le service client, l'Utilisateur peut saisir :\n— Le Médiateur de la République du Congo\n— Les juridictions compétentes de Brazzaville, République du Congo\n\n11.4 Le droit applicable est le droit de la République du Congo. Le tribunal compétent est celui de Brazzaville.`,
  },
  {
    title: "Article 12 — Droit applicable et juridiction compétente",
    content: `Les présentes CGU sont régies par le droit de la République du Congo. En cas de litige, les parties s'efforceront de trouver une solution amiable. À défaut, le tribunal compétent sera exclusivement le Tribunal de Grande Instance de Brazzaville.\n\nLes présentes CGU sont rédigées en langue française, seule version faisant foi en cas de litige d'interprétation.`,
  },
  {
    title: "Article 13 — Durée et résiliation",
    content: `13.1 Les présentes CGU entrent en vigueur dès l'acceptation par l'Utilisateur et pour toute la durée d'utilisation du service.\n\n13.2 L'Utilisateur peut résilier son compte à tout moment via l'application ou en adressant une demande au service client. La résiliation prend effet dans un délai de 72 heures ouvrables.\n\n13.3 Morali Pay se réserve le droit de résilier le compte avec un préavis de 30 jours calendaires, notifié par écrit.\n\n13.4 La résiliation n'affecte pas les transactions antérieurement exécutées. Le solde disponible sera restitué à l'Utilisateur selon les modalités communiquées lors de la clôture du compte.\n\n13.5 En cas de résiliation pour motif légitime (fraude, non-respect des CGU, activité illicite), Morali Pay peut clôturer le compte sans préavis, sous réserve du droit à un recours de l'Utilisateur.`,
  },
  {
    title: "Article 14 — Dispositions finales",
    content: `14.1 Si l'une des clauses des présentes CGU venait à être déclarée nulle ou inapplicable, les autres clauses conserveraient leur pleine force et portée.\n\n14.2 Le fait pour Morali Pay de ne pas se prévaloir d'un droit ne constitue pas une renonciation à ce droit.\n\n14.3 Les présentes CGU, la Politique de Confidentialité et les conditions spécifiques aux services forment l'intégralité de l'accord entre Morali Pay et l'Utilisateur.\n\nDernière mise à jour : Janvier 2025\nVersion : 2.0 — En conformité avec les réglementations CEMAC, COBAC, BEAC et la législation de la République du Congo.`,
  },
];

export default function LegalTerms({ onAccept, onClose, mode = "modal" }: LegalTermsProps) {
  const [expanded, setExpanded] = React.useState<number | null>(null);

  const toggleSection = (idx: number) => {
    setExpanded((prev) => (prev === idx ? null : idx));
  };

  return (
    <div className="legal-doc">
      <div className="legal-doc-header">
        <div className="legal-doc-badge">VERSION 2.0 — JANVIER 2025</div>
        <h2 className="legal-doc-title">Conditions Générales d'Utilisation</h2>
        <p className="legal-doc-subtitle">
          Morali Pay — Services Financiers Numériques
          <br />
          République du Congo — Brazzaville
        </p>
        <div className="legal-doc-line" />
      </div>

      <div className="legal-doc-preamble">
        <p>
          <strong>PRÉAMBULE</strong>
        </p>
        <p>
          Morali Pay est un établissement de services financiers numériques opérant en
          République du Congo, conformément aux réglementations de la Communauté Économique et
          Monétaire de l'Afrique Centrale (CEMAC), de la Banque des États de l'Afrique Centrale
          (BEAC) et de la Commission Bancaire de l'Afrique Centrale (COBAC).
        </p>
        <p>
          Les présentes Conditions Générales d'Utilisation définissent les droits et obligations
          de Morali Pay et de l'Utilisateur dans le cadre de l'utilisation de l'application
          Morali Pay et des services financiers associés.
        </p>
      </div>

      <div className="legal-doc-sections">
        {LEGAL_SECTIONS.map((section, idx) => (
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
          Morali Pay — Établissement de Services Financiers Numériques
          <br />
          Conforme aux réglementations CEMAC • COBAC • BEAC • ANSSI Congo
          <br />
          <span style={{ opacity: 0.5, fontSize: "10px" }}>
            République du Congo — Loi n° 33-2018 • Loi n° 34-2018
          </span>
        </p>
        {mode === "modal" && onAccept && (
          <button
            className="legal-doc-accept"
            onClick={onAccept}
          >
            J'accepte les Conditions Générales
          </button>
        )}
      </div>

      <style>{`
        .legal-doc {
          display: flex;
          flex-direction: column;
          gap: 0;
          animation: legalDocFadeIn 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        }
        @keyframes legalDocFadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .legal-doc-header {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 16px;
        }
        .legal-doc-badge {
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #D4A437;
          background: rgba(212, 164, 55, 0.1);
          border: 1px solid rgba(212, 164, 55, 0.2);
          border-radius: 8px;
          padding: 6px 12px;
          display: inline-block;
          align-self: flex-start;
          box-shadow: 0 0 12px rgba(212, 164, 55, 0.06);
        }
        .legal-doc-title {
          font-size: 20px;
          font-weight: 900;
          color: #fff;
          font-family: 'Inter', 'Montserrat', -apple-system, sans-serif;
          letter-spacing: -0.02em;
          margin: 0;
        }
        .legal-doc-subtitle {
          font-size: 12px;
          color: #94a3b8;
          line-height: 1.5;
          margin: 0;
          font-family: 'Inter', -apple-system, sans-serif;
        }
        .legal-doc-line {
          height: 1px;
          background: linear-gradient(90deg, rgba(212, 164, 55, 0.3), rgba(212, 164, 55, 0.05), transparent);
          margin: 12px 0;
        }
        .legal-doc-preamble {
          background: rgba(212, 164, 55, 0.04);
          border: 1px solid rgba(212, 164, 55, 0.1);
          border-radius: 16px;
          padding: 16px;
          margin-bottom: 16px;
          box-shadow: 0 0 20px rgba(212, 164, 55, 0.03);
        }
        .legal-doc-preamble p {
          font-size: 12px;
          color: #94a3b8;
          line-height: 1.6;
          margin: 0 0 8px 0;
          font-family: 'Inter', -apple-system, sans-serif;
        }
        .legal-doc-preamble p:last-child {
          margin-bottom: 0;
        }
        .legal-doc-preamble strong {
          color: #D4A437;
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .legal-doc-sections {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 16px;
        }
        .legal-section {
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          overflow: hidden;
          transition: all 0.3s ease;
        }
        .legal-section:has(.expanded) {
          border-color: rgba(212, 164, 55, 0.15);
          background: rgba(212, 164, 55, 0.02);
          box-shadow: 0 0 15px rgba(212, 164, 55, 0.06);
        }
        .legal-section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 14px 16px;
          border: none;
          background: transparent;
          color: #fff;
          cursor: pointer;
          width: 100%;
          text-align: left;
          font-family: 'Inter', 'Montserrat', -apple-system, sans-serif;
          transition: background 0.2s ease;
        }
        .legal-section-header:hover {
          background: rgba(255, 255, 255, 0.02);
        }
        .legal-section-title {
          font-size: 12px;
          font-weight: 700;
          color: #e2e8f0;
          line-height: 1.4;
          font-family: 'Inter', 'Montserrat', -apple-system, sans-serif;
        }
        .legal-section-arrow {
          font-size: 14px;
          color: #64748b;
          transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          flex-shrink: 0;
        }
        .legal-section-arrow.rotated {
          transform: rotate(180deg);
          color: #D4A437;
        }
        .legal-section-content {
          padding: 0 16px 14px 16px;
          animation: legalFadeIn 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        }
        @keyframes legalFadeIn {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .legal-section-content p {
          font-size: 11px;
          color: #94a3b8;
          line-height: 1.65;
          margin: 0 0 10px 0;
          font-family: 'Inter', -apple-system, sans-serif;
        }
        .legal-section-content p:last-child {
          margin-bottom: 0;
        }
        .legal-doc-footer {
          display: flex;
          flex-direction: column;
          gap: 8px;
          align-items: center;
          padding-top: 8px;
        }
        .legal-doc-gov {
          font-size: 10px;
          color: #64748b;
          text-align: center;
          line-height: 1.6;
          margin: 0;
          font-family: 'Inter', -apple-system, sans-serif;
        }
        .legal-doc-accept {
          width: 100%;
          height: 52px;
          border-radius: 16px;
          font-size: 14px;
          font-weight: 800;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          background: linear-gradient(135deg, rgba(212, 164, 55, 0.2), rgba(212, 164, 55, 0.08));
          color: #D4A437;
          border: 1px solid rgba(212, 164, 55, 0.25);
          box-shadow: 0 0 20px rgba(212, 164, 55, 0.08);
          transition: all 0.3s ease;
          font-family: 'Inter', 'Montserrat', -apple-system, sans-serif;
          margin-top: 8px;
          position: relative;
          overflow: hidden;
        }
        .legal-doc-accept:hover {
          box-shadow: 0 0 30px rgba(212, 164, 55, 0.15);
          border-color: rgba(212, 164, 55, 0.4);
        }
        .legal-doc-accept:active {
          transform: scale(0.97);
        }
        .legal-doc-accept::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(212, 164, 55, 0.1), transparent);
          transition: left 0.5s ease;
        }
        .legal-doc-accept:hover::before {
          left: 100%;
        }
      `}</style>
    </div>
  );
}
