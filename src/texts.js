// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget (src/widgets.js):
// connection status, errors, the "Test the connection" report, scene action
// results and errors. Four languages, the four of the Gladys interface;
// German says "du", Spanish "usted". test/i18n.test.js checks every table.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './kitchenowl/client.js';

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const CONNECTION_TEXT = {
  noUrl: {
    en: 'Enter the address of your KitchenOwl in the configuration.',
    fr: "Saisissez l'adresse de votre KitchenOwl dans la configuration.",
    de: 'Gib die Adresse deines KitchenOwl in der Konfiguration ein.',
    es: 'Introduzca la dirección de su KitchenOwl en la configuración.',
  },
  invalidUrl: {
    en: 'Address not understood, e.g. http://192.168.1.20:8080',
    fr: 'Adresse incomprise, ex. http://192.168.1.20:8080',
    de: 'Adresse nicht verstanden, z. B. http://192.168.1.20:8080',
    es: 'Dirección no válida, p. ej. http://192.168.1.20:8080',
  },
  noToken: {
    en: 'Enter a KitchenOwl long-lived token in the configuration (Profile, Sessions).',
    fr: 'Saisissez un jeton longue durée KitchenOwl dans la configuration (Profil, Sessions).',
    de: 'Gib in der Konfiguration ein langlebiges KitchenOwl-Token ein (Profil, Sitzungen).',
    es: 'Introduzca un token de larga duración de KitchenOwl en la configuración (Perfil, Sesiones).',
  },
  noHousehold: {
    en: 'The token user belongs to no KitchenOwl household.',
    fr: "L'utilisateur du jeton n'appartient à aucun foyer KitchenOwl.",
    de: 'Der Benutzer des Tokens gehört zu keinem KitchenOwl-Haushalt.',
    es: 'El usuario del token no pertenece a ningún hogar de KitchenOwl.',
  },
};

// One short explanation per error kind (src/kitchenowl/client.js).
export const ERROR_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'KitchenOwl does not answer',
    fr: 'KitchenOwl ne répond pas',
    de: 'KitchenOwl antwortet nicht',
    es: 'KitchenOwl no responde',
  },
  [ERROR_KINDS.TLS]: {
    en: 'certificate refused: tick "Accept self-signed certificates"',
    fr: 'certificat refusé : cochez « Accepter les certificats auto-signés »',
    de: 'Zertifikat abgelehnt: Aktiviere „Selbstsignierte Zertifikate akzeptieren“',
    es: 'certificado rechazado: marque «Aceptar certificados autofirmados»',
  },
  [ERROR_KINDS.AUTH]: {
    en: 'token refused: create a new long-lived token in KitchenOwl',
    fr: 'jeton refusé : créez un nouveau jeton longue durée dans KitchenOwl',
    de: 'Token abgelehnt: Erstelle ein neues langlebiges Token in KitchenOwl',
    es: 'token rechazado: cree un nuevo token de larga duración en KitchenOwl',
  },
  [ERROR_KINDS.NOT_KITCHENOWL]: {
    en: 'no KitchenOwl API at this address',
    fr: 'aucune API KitchenOwl à cette adresse',
    de: 'keine KitchenOwl-API unter dieser Adresse',
    es: 'no hay ninguna API de KitchenOwl en esta dirección',
  },
  [ERROR_KINDS.REDIRECT]: {
    en: 'the address redirects: enter the https:// address',
    fr: "l'adresse redirige : saisissez l'adresse en https://",
    de: 'die Adresse leitet um: Gib die https://-Adresse ein',
    es: 'la dirección redirige: introduzca la dirección https://',
  },
  [ERROR_KINDS.RATE_LIMIT]: {
    en: 'too many requests, retrying later',
    fr: 'trop de requêtes, nouvel essai plus tard',
    de: 'zu viele Anfragen, neuer Versuch später',
    es: 'demasiadas solicitudes, se reintentará más tarde',
  },
  [ERROR_KINDS.HTTP]: {
    en: 'unexpected answer, see the logs',
    fr: 'réponse inattendue, voir les logs',
    de: 'unerwartete Antwort, sieh in den Protokollen nach',
    es: 'respuesta inesperada, consulte los registros',
  },
};

// The "Test the connection" report.
export const REPORT_TEXT = {
  en: {
    ok: (households, lists, items) =>
      `KitchenOwl OK: ${households} household(s), ${lists} shopping list(s), ${items} item(s) to buy.`,
    failed: (reason) => `KitchenOwl: ${reason}.`,
  },
  fr: {
    ok: (households, lists, items) =>
      `KitchenOwl OK : ${households} foyer(s), ${lists} liste(s) de courses, ${items} article(s) à acheter.`,
    failed: (reason) => `KitchenOwl : ${reason}.`,
  },
  de: {
    ok: (households, lists, items) =>
      `KitchenOwl OK: ${households} Haushalt(e), ${lists} Einkaufsliste(n), ${items} Artikel zu kaufen.`,
    failed: (reason) => `KitchenOwl: ${reason}.`,
  },
  es: {
    ok: (households, lists, items) =>
      `KitchenOwl OK: ${households} hogar(es), ${lists} lista(s) de la compra, ${items} artículo(s) por comprar.`,
    failed: (reason) => `KitchenOwl: ${reason}.`,
  },
};

// Errors of the scene actions and the widget buttons (shown in Gladys).
export const ACTION_TEXT = {
  notConfigured: {
    en: 'KitchenOwl is not configured.',
    fr: "KitchenOwl n'est pas configuré.",
    de: 'KitchenOwl ist nicht konfiguriert.',
    es: 'KitchenOwl no está configurado.',
  },
  emptyName: {
    en: 'Give the name of the item.',
    fr: "Indiquez le nom de l'article.",
    de: 'Gib den Namen des Artikels an.',
    es: 'Indique el nombre del artículo.',
  },
  noList: {
    en: 'No KitchenOwl shopping list found: check the configuration.',
    fr: 'Aucune liste de courses KitchenOwl trouvée : vérifiez la configuration.',
    de: 'Keine KitchenOwl-Einkaufsliste gefunden: Prüfe die Konfiguration.',
    es: 'No se ha encontrado ninguna lista de la compra de KitchenOwl: revise la configuración.',
  },
  unknownList: {
    en: 'This shopping list no longer exists in KitchenOwl: choose another device.',
    fr: "Cette liste de courses n'existe plus dans KitchenOwl : choisissez un autre appareil.",
    de: 'Diese Einkaufsliste gibt es in KitchenOwl nicht mehr: Wähle ein anderes Gerät.',
    es: 'Esta lista de la compra ya no existe en KitchenOwl: elija otro dispositivo.',
  },
};

// Toasts and scene results (≤ 200 characters once the names are in).
export const RESULT_TEXT = {
  en: {
    added: (item, list) => `"${item}" added to ${list}.`,
    already: (item, list) => `"${item}" is already on ${list}.`,
    removed: (item, list) => `"${item}" checked off ${list}.`,
    absent: (item, list) => `"${item}" is no longer on ${list}.`,
  },
  fr: {
    added: (item, list) => `« ${item} » ajouté à ${list}.`,
    already: (item, list) => `« ${item} » est déjà sur ${list}.`,
    removed: (item, list) => `« ${item} » coché sur ${list}.`,
    absent: (item, list) => `« ${item} » n'est plus sur ${list}.`,
  },
  de: {
    added: (item, list) => `„${item}“ zu ${list} hinzugefügt.`,
    already: (item, list) => `„${item}“ steht schon auf ${list}.`,
    removed: (item, list) => `„${item}“ auf ${list} abgehakt.`,
    absent: (item, list) => `„${item}“ steht nicht mehr auf ${list}.`,
  },
  es: {
    added: (item, list) => `«${item}» añadido a ${list}.`,
    already: (item, list) => `«${item}» ya está en ${list}.`,
    removed: (item, list) => `«${item}» marcado en ${list}.`,
    absent: (item, list) => `«${item}» ya no está en ${list}.`,
  },
};

export const LANGUAGE_FALLBACK = 'en';

export const pick = (text, language) => text[language] ?? text[LANGUAGE_FALLBACK];

/** A multi-language object from a function of the language. */
export const allLanguages = (render) =>
  Object.fromEntries(Object.keys(INIT_FAILED).map((language) => [language, render(language)]));
