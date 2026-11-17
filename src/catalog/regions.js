/**
 * Geographic region catalog, IANA timezone inference, UTC/locale matching,
 * and datacenter ASN classification.
 */

export const DC_ASN = [
  "amazon",
  "aws",
  "google",
  "microsoft",
  "azure",
  "digitalocean",
  "vultr",
  "linode",
  "akamai",
  "cloudflare",
  "ovh",
  "hetzner",
  "alibaba",
  "aliyun",
  "tencent",
  "oracle",
  "datacamp",
  "m247",
  "choopa",
  "contabo",
  "leaseweb",
  "astrix",
  "hosting",
  "datacenter",
  "data center",
  "server",
  "cdn",
  "gsl",
  "gsl networks",
  "cogent",
  "scaleway",
  "fly.io",
  "tzulo",
  "psychz",
  "zenlayer",
  "sharktech",
  "hostinger",
  "ionos",
];

const REGION_ALIASES = new Map([
  ["uk", "gb"],
  ["england", "gb"],
  ["britain", "gb"],
  ["greatbritain", "gb"],
  ["uae", "ae"],
  ["emirates", "ae"],
  ["usa", "us"],
  ["holland", "nl"],
  ["southkorea", "kr"],
  ["korea", "kr"],
  ["ivorycoast", "ci"],
  ["czech", "cz"],
  ["czechia", "cz"],
  ["timor", "tl"],
  ["burma", "mm"],
  ["persia", "ir"],
  ["tuerkiye", "tr"],
  ["turkiye", "tr"],
]);

/**
 * Full IANA zone -> ISO2 (lowercase) mapping covering Node's 418 canonical zones
 * plus historical aliases and legacy links.
 */
const IANA_TO_COUNTRY_ENTRIES = [
  // Africa
  ["Africa/Abidjan", ["ci"]],
  ["Africa/Accra", ["gh"]],
  ["Africa/Addis_Ababa", ["et"]],
  ["Africa/Algiers", ["dz"]],
  ["Africa/Asmara", ["er"]],
  ["Africa/Asmera", ["er"]],
  ["Africa/Bamako", ["ml"]],
  ["Africa/Bangui", ["cf"]],
  ["Africa/Banjul", ["gm"]],
  ["Africa/Bissau", ["gw"]],
  ["Africa/Blantyre", ["mw"]],
  ["Africa/Brazzaville", ["cg"]],
  ["Africa/Bujumbura", ["bi"]],
  ["Africa/Cairo", ["eg"]],
  ["Africa/Casablanca", ["ma"]],
  ["Africa/Ceuta", ["es"]],
  ["Africa/Conakry", ["gn"]],
  ["Africa/Dakar", ["sn"]],
  ["Africa/Dar_es_Salaam", ["tz"]],
  ["Africa/Djibouti", ["dj"]],
  ["Africa/Douala", ["cm"]],
  ["Africa/El_Aaiun", ["eh", "ma"]],
  ["Africa/Freetown", ["sl"]],
  ["Africa/Gaborone", ["bw"]],
  ["Africa/Harare", ["zw"]],
  ["Africa/Johannesburg", ["za"]],
  ["Africa/Juba", ["ss"]],
  ["Africa/Kampala", ["ug"]],
  ["Africa/Khartoum", ["sd"]],
  ["Africa/Kigali", ["rw"]],
  ["Africa/Kinshasa", ["cd"]],
  ["Africa/Lagos", ["ng"]],
  ["Africa/Libreville", ["ga"]],
  ["Africa/Lome", ["tg"]],
  ["Africa/Luanda", ["ao"]],
  ["Africa/Lubumbashi", ["cd"]],
  ["Africa/Lusaka", ["zm"]],
  ["Africa/Malabo", ["gq"]],
  ["Africa/Maputo", ["mz"]],
  ["Africa/Maseru", ["ls"]],
  ["Africa/Mbabane", ["sz"]],
  ["Africa/Mogadishu", ["so"]],
  ["Africa/Monrovia", ["lr"]],
  ["Africa/Nairobi", ["ke"]],
  ["Africa/Ndjamena", ["td"]],
  ["Africa/Niamey", ["ne"]],
  ["Africa/Nouakchott", ["mr"]],
  ["Africa/Ouagadougou", ["bf"]],
  ["Africa/Porto-Novo", ["bj"]],
  ["Africa/Sao_Tome", ["st"]],
  ["Africa/Timbuktu", ["ml"]],
  ["Africa/Tripoli", ["ly"]],
  ["Africa/Tunis", ["tn"]],
  ["Africa/Windhoek", ["na"]],

  // America
  ["America/Adak", ["us"]],
  ["America/Anchorage", ["us"]],
  ["America/Anguilla", ["ai"]],
  ["America/Antigua", ["ag"]],
  ["America/Araguaina", ["br"]],
  ["America/Argentina/Buenos_Aires", ["ar"]],
  ["America/Argentina/Catamarca", ["ar"]],
  ["America/Argentina/ComodRivadavia", ["ar"]],
  ["America/Argentina/Cordoba", ["ar"]],
  ["America/Argentina/Jujuy", ["ar"]],
  ["America/Argentina/La_Rioja", ["ar"]],
  ["America/Argentina/Mendoza", ["ar"]],
  ["America/Argentina/Rio_Gallegos", ["ar"]],
  ["America/Argentina/Salta", ["ar"]],
  ["America/Argentina/San_Juan", ["ar"]],
  ["America/Argentina/San_Luis", ["ar"]],
  ["America/Argentina/Tucuman", ["ar"]],
  ["America/Argentina/Ushuaia", ["ar"]],
  ["America/Aruba", ["aw"]],
  ["America/Asuncion", ["py"]],
  ["America/Atikokan", ["ca"]],
  ["America/Atka", ["us"]],
  ["America/Bahia", ["br"]],
  ["America/Bahia_Banderas", ["mx"]],
  ["America/Barbados", ["bb"]],
  ["America/Belem", ["br"]],
  ["America/Belize", ["bz"]],
  ["America/Blanc-Sablon", ["ca"]],
  ["America/Boa_Vista", ["br"]],
  ["America/Bogota", ["co"]],
  ["America/Boise", ["us"]],
  ["America/Buenos_Aires", ["ar"]],
  ["America/Cambridge_Bay", ["ca"]],
  ["America/Campo_Grande", ["br"]],
  ["America/Cancun", ["mx"]],
  ["America/Caracas", ["ve"]],
  ["America/Catamarca", ["ar"]],
  ["America/Cayenne", ["gf"]],
  ["America/Cayman", ["ky"]],
  ["America/Chicago", ["us"]],
  ["America/Chihuahua", ["mx"]],
  ["America/Ciudad_Juarez", ["mx"]],
  ["America/Coral_Harbour", ["ca"]],
  ["America/Cordoba", ["ar"]],
  ["America/Costa_Rica", ["cr"]],
  ["America/Coyhaique", ["cl"]],
  ["America/Creston", ["ca"]],
  ["America/Cuiaba", ["br"]],
  ["America/Curacao", ["cw"]],
  ["America/Danmarkshavn", ["gl"]],
  ["America/Dawson", ["ca"]],
  ["America/Dawson_Creek", ["ca"]],
  ["America/Denver", ["us"]],
  ["America/Detroit", ["us"]],
  ["America/Dominica", ["dm"]],
  ["America/Edmonton", ["ca"]],
  ["America/Eirunepe", ["br"]],
  ["America/El_Salvador", ["sv"]],
  ["America/Ensenada", ["mx"]],
  ["America/Fort_Nelson", ["ca"]],
  ["America/Fort_Wayne", ["us"]],
  ["America/Fortaleza", ["br"]],
  ["America/Glace_Bay", ["ca"]],
  ["America/Godthab", ["gl"]],
  ["America/Goose_Bay", ["ca"]],
  ["America/Grand_Turk", ["tc"]],
  ["America/Grenada", ["gd"]],
  ["America/Guadeloupe", ["gp"]],
  ["America/Guatemala", ["gt"]],
  ["America/Guayaquil", ["ec"]],
  ["America/Guyana", ["gy"]],
  ["America/Halifax", ["ca"]],
  ["America/Havana", ["cu"]],
  ["America/Hermosillo", ["mx"]],
  ["America/Indiana/Indianapolis", ["us"]],
  ["America/Indiana/Knox", ["us"]],
  ["America/Indiana/Marengo", ["us"]],
  ["America/Indiana/Petersburg", ["us"]],
  ["America/Indiana/Tell_City", ["us"]],
  ["America/Indiana/Vevay", ["us"]],
  ["America/Indiana/Vincennes", ["us"]],
  ["America/Indiana/Winamac", ["us"]],
  ["America/Indianapolis", ["us"]],
  ["America/Inuvik", ["ca"]],
  ["America/Iqaluit", ["ca"]],
  ["America/Jamaica", ["jm"]],
  ["America/Jujuy", ["ar"]],
  ["America/Juneau", ["us"]],
  ["America/Kentucky/Louisville", ["us"]],
  ["America/Kentucky/Monticello", ["us"]],
  ["America/Knox_IN", ["us"]],
  ["America/Kralendijk", ["bq"]],
  ["America/La_Paz", ["bo"]],
  ["America/Lima", ["pe"]],
  ["America/Los_Angeles", ["us"]],
  ["America/Louisville", ["us"]],
  ["America/Lower_Princes", ["sx"]],
  ["America/Maceio", ["br"]],
  ["America/Managua", ["ni"]],
  ["America/Manaus", ["br"]],
  ["America/Marigot", ["mf"]],
  ["America/Martinique", ["mq"]],
  ["America/Matamoros", ["mx"]],
  ["America/Mazatlan", ["mx"]],
  ["America/Mendoza", ["ar"]],
  ["America/Menominee", ["us"]],
  ["America/Merida", ["mx"]],
  ["America/Metlakatla", ["us"]],
  ["America/Mexico_City", ["mx"]],
  ["America/Miquelon", ["pm"]],
  ["America/Moncton", ["ca"]],
  ["America/Monterrey", ["mx"]],
  ["America/Montevideo", ["uy"]],
  ["America/Montreal", ["ca"]],
  ["America/Montserrat", ["ms"]],
  ["America/Nassau", ["bs"]],
  ["America/New_York", ["us"]],
  ["America/Nipigon", ["ca"]],
  ["America/Nome", ["us"]],
  ["America/Noronha", ["br"]],
  ["America/North_Dakota/Beulah", ["us"]],
  ["America/North_Dakota/Center", ["us"]],
  ["America/North_Dakota/New_Salem", ["us"]],
  ["America/Nuuk", ["gl"]],
  ["America/Ojinaga", ["mx"]],
  ["America/Panama", ["pa"]],
  ["America/Pangnirtung", ["ca"]],
  ["America/Paramaribo", ["sr"]],
  ["America/Phoenix", ["us"]],
  ["America/Port-au-Prince", ["ht"]],
  ["America/Port_of_Spain", ["tt"]],
  ["America/Porto_Acre", ["br"]],
  ["America/Porto_Velho", ["br"]],
  ["America/Puerto_Rico", ["pr"]],
  ["America/Punta_Arenas", ["cl"]],
  ["America/Rainy_River", ["ca"]],
  ["America/Rankin_Inlet", ["ca"]],
  ["America/Recife", ["br"]],
  ["America/Regina", ["ca"]],
  ["America/Resolute", ["ca"]],
  ["America/Rio_Branco", ["br"]],
  ["America/Rosario", ["ar"]],
  ["America/Santa_Isabel", ["mx"]],
  ["America/Santarem", ["br"]],
  ["America/Santiago", ["cl"]],
  ["America/Santo_Domingo", ["do"]],
  ["America/Sao_Paulo", ["br"]],
  ["America/Scoresbysund", ["gl"]],
  ["America/Shiprock", ["us"]],
  ["America/Sitka", ["us"]],
  ["America/St_Barthelemy", ["bl"]],
  ["America/St_Johns", ["ca"]],
  ["America/St_Kitts", ["kn"]],
  ["America/St_Lucia", ["lc"]],
  ["America/St_Thomas", ["vi"]],
  ["America/St_Vincent", ["vc"]],
  ["America/Swift_Current", ["ca"]],
  ["America/Tegucigalpa", ["hn"]],
  ["America/Thule", ["gl"]],
  ["America/Thunder_Bay", ["ca"]],
  ["America/Tijuana", ["mx"]],
  ["America/Toronto", ["ca"]],
  ["America/Tortola", ["vg"]],
  ["America/Vancouver", ["ca"]],
  ["America/Virgin", ["vi"]],
  ["America/Whitehorse", ["ca"]],
  ["America/Winnipeg", ["ca"]],
  ["America/Yakutat", ["us"]],
  ["America/Yellowknife", ["ca"]],

  // Antarctica & Arctic
  ["Antarctica/Casey", ["aq"]],
  ["Antarctica/Davis", ["aq"]],
  ["Antarctica/DumontDUrville", ["aq"]],
  ["Antarctica/Macquarie", ["au"]],
  ["Antarctica/Mawson", ["aq"]],
  ["Antarctica/McMurdo", ["aq"]],
  ["Antarctica/Palmer", ["aq"]],
  ["Antarctica/Rothera", ["aq"]],
  ["Antarctica/South_Pole", ["aq"]],
  ["Antarctica/Syowa", ["aq"]],
  ["Antarctica/Troll", ["aq"]],
  ["Antarctica/Vostok", ["aq"]],
  ["Arctic/Longyearbyen", ["sj", "no"]],

  // Asia
  ["Asia/Aden", ["ye"]],
  ["Asia/Almaty", ["kz"]],
  ["Asia/Amman", ["jo"]],
  ["Asia/Anadyr", ["ru"]],
  ["Asia/Aqtau", ["kz"]],
  ["Asia/Aqtobe", ["kz"]],
  ["Asia/Ashgabat", ["tm"]],
  ["Asia/Ashkhabad", ["tm"]],
  ["Asia/Atyrau", ["kz"]],
  ["Asia/Baghdad", ["iq"]],
  ["Asia/Bahrain", ["bh"]],
  ["Asia/Baku", ["az"]],
  ["Asia/Bangkok", ["th"]],
  ["Asia/Barnaul", ["ru"]],
  ["Asia/Beirut", ["lb"]],
  ["Asia/Bishkek", ["kg"]],
  ["Asia/Brunei", ["bn"]],
  ["Asia/Calcutta", ["in"]],
  ["Asia/Chita", ["ru"]],
  ["Asia/Choibalsan", ["mn"]],
  ["Asia/Chongqing", ["cn"]],
  ["Asia/Chungking", ["cn"]],
  ["Asia/Colombo", ["lk"]],
  ["Asia/Dacca", ["bd"]],
  ["Asia/Damascus", ["sy"]],
  ["Asia/Dhaka", ["bd"]],
  ["Asia/Dili", ["tl"]],
  ["Asia/Dubai", ["ae"]],
  ["Asia/Dushanbe", ["tj"]],
  ["Asia/Famagusta", ["cy"]],
  ["Asia/Gaza", ["ps"]],
  ["Asia/Harbin", ["cn"]],
  ["Asia/Hebron", ["ps"]],
  ["Asia/Ho_Chi_Minh", ["vn"]],
  ["Asia/Hong_Kong", ["hk"]],
  ["Asia/Hovd", ["mn"]],
  ["Asia/Irkutsk", ["ru"]],
  ["Asia/Istanbul", ["tr"]],
  ["Asia/Jakarta", ["id"]],
  ["Asia/Jayapura", ["id"]],
  ["Asia/Jerusalem", ["il"]],
  ["Asia/Kabul", ["af"]],
  ["Asia/Kamchatka", ["ru"]],
  ["Asia/Karachi", ["pk"]],
  ["Asia/Kashgar", ["cn"]],
  ["Asia/Kathmandu", ["np"]],
  ["Asia/Katmandu", ["np"]],
  ["Asia/Khandyga", ["ru"]],
  ["Asia/Kolkata", ["in"]],
  ["Asia/Krasnoyarsk", ["ru"]],
  ["Asia/Kuala_Lumpur", ["my"]],
  ["Asia/Kuching", ["my"]],
  ["Asia/Kuwait", ["kw"]],
  ["Asia/Macao", ["mo"]],
  ["Asia/Macau", ["mo"]],
  ["Asia/Magadan", ["ru"]],
  ["Asia/Makassar", ["id"]],
  ["Asia/Manila", ["ph"]],
  ["Asia/Muscat", ["om"]],
  ["Asia/Nicosia", ["cy"]],
  ["Asia/Novokuznetsk", ["ru"]],
  ["Asia/Novosibirsk", ["ru"]],
  ["Asia/Omsk", ["ru"]],
  ["Asia/Oral", ["kz"]],
  ["Asia/Phnom_Penh", ["kh"]],
  ["Asia/Pontianak", ["id"]],
  ["Asia/Pyongyang", ["kp"]],
  ["Asia/Qatar", ["qa"]],
  ["Asia/Qostanay", ["kz"]],
  ["Asia/Qyzylorda", ["kz"]],
  ["Asia/Rangoon", ["mm"]],
  ["Asia/Riyadh", ["sa"]],
  ["Asia/Saigon", ["vn"]],
  ["Asia/Sakhalin", ["ru"]],
  ["Asia/Samarkand", ["uz"]],
  ["Asia/Seoul", ["kr"]],
  ["Asia/Shanghai", ["cn"]],
  ["Asia/Singapore", ["sg"]],
  ["Asia/Srednekolymsk", ["ru"]],
  ["Asia/Taipei", ["tw"]],
  ["Asia/Tashkent", ["uz"]],
  ["Asia/Tbilisi", ["ge"]],
  ["Asia/Tehran", ["ir"]],
  ["Asia/Tel_Aviv", ["il"]],
  ["Asia/Thimbu", ["bt"]],
  ["Asia/Thimphu", ["bt"]],
  ["Asia/Tokyo", ["jp"]],
  ["Asia/Tomsk", ["ru"]],
  ["Asia/Ujung_Pandang", ["id"]],
  ["Asia/Ulaanbaatar", ["mn"]],
  ["Asia/Ulan_Bator", ["mn"]],
  ["Asia/Urumqi", ["cn"]],
  ["Asia/Ust-Nera", ["ru"]],
  ["Asia/Vientiane", ["la"]],
  ["Asia/Vladivostok", ["ru"]],
  ["Asia/Yakutsk", ["ru"]],
  ["Asia/Yangon", ["mm"]],
  ["Asia/Yekaterinburg", ["ru"]],
  ["Asia/Yerevan", ["am"]],

  // Atlantic
  ["Atlantic/Azores", ["pt"]],
  ["Atlantic/Bermuda", ["bm"]],
  ["Atlantic/Canary", ["es"]],
  ["Atlantic/Cape_Verde", ["cv"]],
  ["Atlantic/Faeroe", ["fo"]],
  ["Atlantic/Faroe", ["fo"]],
  ["Atlantic/Jan_Mayen", ["no"]],
  ["Atlantic/Madeira", ["pt"]],
  ["Atlantic/Reykjavik", ["is"]],
  ["Atlantic/South_Georgia", ["gs"]],
  ["Atlantic/St_Helena", ["sh"]],
  ["Atlantic/Stanley", ["fk"]],

  // Australia
  ["Australia/ACT", ["au"]],
  ["Australia/Adelaide", ["au"]],
  ["Australia/Brisbane", ["au"]],
  ["Australia/Broken_Hill", ["au"]],
  ["Australia/Canberra", ["au"]],
  ["Australia/Currie", ["au"]],
  ["Australia/Darwin", ["au"]],
  ["Australia/Eucla", ["au"]],
  ["Australia/Hobart", ["au"]],
  ["Australia/LHI", ["au"]],
  ["Australia/Lindeman", ["au"]],
  ["Australia/Lord_Howe", ["au"]],
  ["Australia/Melbourne", ["au"]],
  ["Australia/NSW", ["au"]],
  ["Australia/North", ["au"]],
  ["Australia/Perth", ["au"]],
  ["Australia/Queensland", ["au"]],
  ["Australia/South", ["au"]],
  ["Australia/Sydney", ["au"]],
  ["Australia/Tasmania", ["au"]],
  ["Australia/Victoria", ["au"]],
  ["Australia/West", ["au"]],
  ["Australia/Yancowinna", ["au"]],

  // Europe
  ["Europe/Amsterdam", ["nl"]],
  ["Europe/Andorra", ["ad"]],
  ["Europe/Astrakhan", ["ru"]],
  ["Europe/Athens", ["gr"]],
  ["Europe/Belfast", ["gb"]],
  ["Europe/Belgrade", ["rs"]],
  ["Europe/Berlin", ["de"]],
  ["Europe/Bratislava", ["sk"]],
  ["Europe/Brussels", ["be"]],
  ["Europe/Bucharest", ["ro"]],
  ["Europe/Budapest", ["hu"]],
  ["Europe/Busingen", ["de"]],
  ["Europe/Chisinau", ["md"]],
  ["Europe/Copenhagen", ["dk"]],
  ["Europe/Dublin", ["ie"]],
  ["Europe/Gibraltar", ["gi"]],
  ["Europe/Guernsey", ["gg"]],
  ["Europe/Helsinki", ["fi"]],
  ["Europe/Isle_of_Man", ["im"]],
  ["Europe/Istanbul", ["tr"]],
  ["Europe/Jersey", ["je"]],
  ["Europe/Kaliningrad", ["ru"]],
  ["Europe/Kiev", ["ua"]],
  ["Europe/Kirov", ["ru"]],
  ["Europe/Kyiv", ["ua"]],
  ["Europe/Lisbon", ["pt"]],
  ["Europe/Ljubljana", ["si"]],
  ["Europe/London", ["gb"]],
  ["Europe/Luxembourg", ["lu"]],
  ["Europe/Madrid", ["es"]],
  ["Europe/Malta", ["mt"]],
  ["Europe/Mariehamn", ["ax", "fi"]],
  ["Europe/Minsk", ["by"]],
  ["Europe/Monaco", ["mc"]],
  ["Europe/Moscow", ["ru"]],
  ["Europe/Nicosia", ["cy"]],
  ["Europe/Oslo", ["no"]],
  ["Europe/Paris", ["fr"]],
  ["Europe/Podgorica", ["me"]],
  ["Europe/Prague", ["cz"]],
  ["Europe/Riga", ["lv"]],
  ["Europe/Rome", ["it"]],
  ["Europe/Samara", ["ru"]],
  ["Europe/San_Marino", ["sm"]],
  ["Europe/Sarajevo", ["ba"]],
  ["Europe/Saratov", ["ru"]],
  ["Europe/Simferopol", ["ua", "ru"]],
  ["Europe/Skopje", ["mk"]],
  ["Europe/Sofia", ["bg"]],
  ["Europe/Stockholm", ["se"]],
  ["Europe/Tallinn", ["ee"]],
  ["Europe/Tirane", ["al"]],
  ["Europe/Tiraspol", ["md"]],
  ["Europe/Ulyanovsk", ["ru"]],
  ["Europe/Uzhgorod", ["ua"]],
  ["Europe/Vaduz", ["li"]],
  ["Europe/Vatican", ["va"]],
  ["Europe/Vienna", ["at"]],
  ["Europe/Vilnius", ["lt"]],
  ["Europe/Volgograd", ["ru"]],
  ["Europe/Warsaw", ["pl"]],
  ["Europe/Zagreb", ["hr"]],
  ["Europe/Zaporozhye", ["ua"]],
  ["Europe/Zurich", ["ch"]],

  // Indian
  ["Indian/Antananarivo", ["mg"]],
  ["Indian/Chagos", ["io"]],
  ["Indian/Christmas", ["cx"]],
  ["Indian/Cocos", ["cc"]],
  ["Indian/Comoro", ["km"]],
  ["Indian/Kerguelen", ["tf"]],
  ["Indian/Mahe", ["sc"]],
  ["Indian/Maldives", ["mv"]],
  ["Indian/Mauritius", ["mu"]],
  ["Indian/Mayotte", ["yt"]],
  ["Indian/Reunion", ["re"]],

  // Pacific
  ["Pacific/Apia", ["ws"]],
  ["Pacific/Auckland", ["nz"]],
  ["Pacific/Bougainville", ["pg"]],
  ["Pacific/Chatham", ["nz"]],
  ["Pacific/Chuuk", ["fm"]],
  ["Pacific/Easter", ["cl"]],
  ["Pacific/Efate", ["vu"]],
  ["Pacific/Enderbury", ["ki"]],
  ["Pacific/Fakaofo", ["tk"]],
  ["Pacific/Fiji", ["fj"]],
  ["Pacific/Funafuti", ["tv"]],
  ["Pacific/Galapagos", ["ec"]],
  ["Pacific/Gambier", ["pf"]],
  ["Pacific/Guadalcanal", ["sb"]],
  ["Pacific/Guam", ["gu"]],
  ["Pacific/Honolulu", ["us"]],
  ["Pacific/Johnston", ["us"]],
  ["Pacific/Kanton", ["ki"]],
  ["Pacific/Kiritimati", ["ki"]],
  ["Pacific/Kosrae", ["fm"]],
  ["Pacific/Kwajalein", ["mh"]],
  ["Pacific/Majuro", ["mh"]],
  ["Pacific/Marquesas", ["pf"]],
  ["Pacific/Midway", ["um"]],
  ["Pacific/Nauru", ["nr"]],
  ["Pacific/Niue", ["nu"]],
  ["Pacific/Norfolk", ["nf"]],
  ["Pacific/Noumea", ["nc"]],
  ["Pacific/Pago_Pago", ["as"]],
  ["Pacific/Palau", ["pw"]],
  ["Pacific/Pitcairn", ["pn"]],
  ["Pacific/Pohnpei", ["fm"]],
  ["Pacific/Ponape", ["fm"]],
  ["Pacific/Port_Moresby", ["pg"]],
  ["Pacific/Rarotonga", ["ck"]],
  ["Pacific/Saipan", ["mp"]],
  ["Pacific/Samoa", ["as"]],
  ["Pacific/Tahiti", ["pf"]],
  ["Pacific/Tarawa", ["ki"]],
  ["Pacific/Tongatapu", ["to"]],
  ["Pacific/Truk", ["fm"]],
  ["Pacific/Wake", ["um"]],
  ["Pacific/Wallis", ["wf"]],
  ["Pacific/Yap", ["fm"]],

  // Legacy short / country aliases
  ["US/Alaska", ["us"]],
  ["US/Aleutian", ["us"]],
  ["US/Arizona", ["us"]],
  ["US/Central", ["us"]],
  ["US/East-Indiana", ["us"]],
  ["US/Eastern", ["us"]],
  ["US/Hawaii", ["us"]],
  ["US/Indiana-Starke", ["us"]],
  ["US/Michigan", ["us"]],
  ["US/Mountain", ["us"]],
  ["US/Pacific", ["us"]],
  ["US/Samoa", ["as"]],
  ["Canada/Atlantic", ["ca"]],
  ["Canada/Central", ["ca"]],
  ["Canada/Eastern", ["ca"]],
  ["Canada/Mountain", ["ca"]],
  ["Canada/Newfoundland", ["ca"]],
  ["Canada/Pacific", ["ca"]],
  ["Canada/Saskatchewan", ["ca"]],
  ["Canada/Yukon", ["ca"]],
  ["Mexico/BajaNorte", ["mx"]],
  ["Mexico/BajaSur", ["mx"]],
  ["Mexico/General", ["mx"]],
  ["Brazil/Acre", ["br"]],
  ["Brazil/DeNoronha", ["br"]],
  ["Brazil/East", ["br"]],
  ["Brazil/West", ["br"]],
  ["Chile/Continental", ["cl"]],
  ["Chile/EasterIsland", ["cl"]],
  ["Cuba", ["cu"]],
  ["Egypt", ["eg"]],
  ["Eire", ["ie"]],
  ["GB", ["gb"]],
  ["GB-Eire", ["gb"]],
  ["Hongkong", ["hk"]],
  ["Iceland", ["is"]],
  ["Iran", ["ir"]],
  ["Israel", ["il"]],
  ["Jamaica", ["jm"]],
  ["Japan", ["jp"]],
  ["Kwajalein", ["mh"]],
  ["Libya", ["ly"]],
  ["NZ", ["nz"]],
  ["NZ-CHAT", ["nz"]],
  ["Navajo", ["us"]],
  ["PRC", ["cn"]],
  ["Poland", ["pl"]],
  ["Portugal", ["pt"]],
  ["ROC", ["tw"]],
  ["ROK", ["kr"]],
  ["Singapore", ["sg"]],
  ["Turkey", ["tr"]],
  ["W-SU", ["ru"]],
];

const IANA_TO_COUNTRY = new Map();
const IANA_TO_COUNTRY_LOWER = new Map();
for (const [zone, countries] of IANA_TO_COUNTRY_ENTRIES) {
  IANA_TO_COUNTRY.set(zone, countries);
  IANA_TO_COUNTRY_LOWER.set(zone.toLowerCase(), countries);
}

const GENERIC_TIMEZONES = new Set([
  "utc",
  "gmt",
  "gmt+0",
  "gmt-0",
  "gmt0",
  "etc/utc",
  "etc/gmt",
  "etc/gmt+0",
  "etc/gmt-0",
  "etc/gmt0",
  "etc/greenwich",
  "etc/universal",
  "etc/zulu",
  "greenwich",
  "universal",
  "zulu",
]);

/**
 * Format signed offset minutes into "+1", "-4", "+5:30", "+0".
 * @param {number} minutes
 * @returns {string}
 */
export function utcFmt(minutes) {
  if (!Number.isFinite(minutes)) return "+0";
  const rounded = Math.trunc(minutes);
  const abs = Math.abs(rounded);
  const sign = rounded >= 0 ? "+" : "-";
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return sign + h + (m === 0 ? "" : ":" + String(m).padStart(2, "0"));
}

/**
 * Compute offset in minutes for an IANA timezone at a given timestamp.
 * @param {string} zoneId
 * @param {Date} [date]
 * @returns {number|null}
 */
function offsetMinutesForZone(zoneId, date = new Date()) {
  try {
    const opts = { timeZoneName: "shortOffset" };
    if (zoneId && zoneId.trim()) {
      opts.timeZone = zoneId.trim();
    }
    const parts = new Intl.DateTimeFormat("en-US", opts).formatToParts(date);
    const tzName = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
    if (!tzName || tzName === "GMT" || tzName === "UTC") {
      return 0;
    }
    return parseMin(tzName);
  } catch {
    return null;
  }
}

/**
 * Current UTC text for a zoneId, e.g. "UTC-4", "UTC+5:30", "UTC+0".
 * @param {string} [zoneId]
 * @returns {string}
 */
export function utcAt(zoneId) {
  const mins = offsetMinutesForZone(zoneId, new Date());
  if (mins === null) {
    return "UTC+0";
  }
  return "UTC" + utcFmt(mins);
}

/**
 * Parse offset minutes from "UTC+5:30", "GMT-4", "+8", "-3:30", "UTC".
 * @param {string} utcStr
 * @returns {number|null}
 */
export function parseMin(utcStr) {
  if (typeof utcStr !== "string") return null;
  let s = utcStr.trim();
  if (!s) return null;

  const upper = s.toUpperCase();
  if (upper.startsWith("UTC")) {
    s = s.slice(3).trim();
  } else if (upper.startsWith("GMT")) {
    s = s.slice(3).trim();
  }

  if (s === "") return 0;

  const match = /^([+-])?(\d{1,2})(?::(\d{2}))?$/.exec(s);
  if (!match) return null;

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number.parseInt(match[2], 10);
  const mins = match[3] ? Number.parseInt(match[3], 10) : 0;
  if (hours > 23 || mins > 59) return null;

  const total = sign * (hours * 60 + mins);
  return total === 0 ? 0 : total;
}

/**
 * Check whether an actual UTC offset (e.g. "UTC-4") falls inside an expected
 * range or list (e.g. "UTC-4~-10", "UTC+5:30", "UTC+1/UTC+2").
 * @param {string} expectedUtcRange
 * @param {string} actualUtc
 * @returns {boolean}
 */
export function utcMatch(expectedUtcRange, actualUtc) {
  if (typeof expectedUtcRange !== "string" || !expectedUtcRange.trim()) return false;
  const actual = parseMin(actualUtc);
  if (actual === null) return false;

  let expr = expectedUtcRange.trim();
  if (/^(UTC|GMT)/i.test(expr)) {
    expr = expr.slice(3).trim();
  }
  if (expr === "") return actual === 0;

  for (const rawSeg of expr.split("/")) {
    const seg = rawSeg.trim();
    if (!seg) continue;
    if (seg.includes("~")) {
      const [loStr, hiStr] = seg.split("~");
      const lo = parseMin(loStr);
      const hi = parseMin(hiStr);
      if (lo !== null && hi !== null) {
        if (actual >= Math.min(lo, hi) && actual <= Math.max(lo, hi)) {
          return true;
        }
      }
    } else {
      const p = parseMin(seg);
      if (p !== null && p === actual) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Extract lowercase ISO2 country code from locale string ("es-VE", "en_US.UTF-8", etc.).
 * @param {string} localeStr
 * @returns {string}
 */
export function extractLocaleCountry(localeStr) {
  if (typeof localeStr !== "string" || !localeStr.trim()) return "";
  let clean = localeStr.trim();
  const hashIdx = clean.indexOf("#");
  if (hashIdx >= 0) clean = clean.slice(0, hashIdx);
  const dotIdx = clean.indexOf(".");
  if (dotIdx >= 0) clean = clean.slice(0, dotIdx);
  const atIdx = clean.indexOf("@");
  if (atIdx >= 0) clean = clean.slice(0, atIdx);

  const parts = clean.split(/[_-]+/).filter(Boolean);
  if (parts.length <= 1) return "";

  for (let i = 1; i < parts.length; i++) {
    const token = parts[i];
    if (/^[a-zA-Z]{2}$/.test(token)) {
      return token.toLowerCase();
    }
  }
  return "";
}

/**
 * Check whether actualLocale's country matches any expected locale in an array or delimited string.
 * @param {string[]|string} expectedLocales
 * @param {string} actualLocale
 * @returns {boolean}
 */
export function localeMatch(expectedLocales, actualLocale) {
  const actualCountry = extractLocaleCountry(actualLocale);
  if (!actualCountry) return false;

  const list = Array.isArray(expectedLocales)
    ? expectedLocales
    : typeof expectedLocales === "string"
      ? expectedLocales.split(/[\/;,]+/)
      : [];

  for (const rawTok of list) {
    const tok = typeof rawTok === "string" ? rawTok.trim() : "";
    if (!tok) continue;
    const expectedCountry = /^[a-zA-Z]{2}$/.test(tok)
      ? tok.toLowerCase()
      : extractLocaleCountry(tok);
    if (expectedCountry && expectedCountry === actualCountry) {
      return true;
    }
  }
  return false;
}

/**
 * Infer lowercase ISO2 country codes from an IANA timezone ID.
 * @param {string} zoneId
 * @returns {string[]}
 */
export function inferCountriesFromTimezone(zoneId) {
  if (typeof zoneId !== "string") return [];
  const trimmed = zoneId.trim();
  if (!trimmed) return [];

  const lower = trimmed.toLowerCase();
  if (GENERIC_TIMEZONES.has(lower) || lower.startsWith("etc/gmt")) {
    return [];
  }

  const direct = IANA_TO_COUNTRY.get(trimmed) ?? IANA_TO_COUNTRY_LOWER.get(lower);
  if (direct) {
    return [...direct];
  }

  // Fallback: match against region catalog zones
  for (const region of REGIONS) {
    if (region.zones.some((z) => z.toLowerCase() === lower)) {
      return [region.iso];
    }
  }

  return [];
}

/**
 * Convert an ISO2 code ("jp") into its regional indicator flag emoji.
 * @param {string} iso
 * @returns {string}
 */
export function flagOf(iso) {
  if (typeof iso !== "string") return "";
  const clean = iso.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(clean)) return "";
  return String.fromCodePoint(
    0x1f1e6 + (clean.charCodeAt(0) - 65),
    0x1f1e6 + (clean.charCodeAt(1) - 65)
  );
}

/**
 * Detect whether an ASN/organization string belongs to a known datacenter or hosting provider.
 * @param {string} orgString
 * @returns {boolean}
 */
export function isDatacenterOrg(orgString) {
  if (typeof orgString !== "string" || !orgString.trim()) return false;
  const hay = orgString.toLowerCase();
  for (const term of DC_ASN) {
    if (term.length <= 4 && /^[a-z0-9]+$/.test(term)) {
      const re = new RegExp(`(^|[^a-z0-9])${term}([^a-z0-9]|$)`, "i");
      if (re.test(hay)) return true;
    } else if (hay.includes(term)) {
      return true;
    }
  }
  return false;
}

function computeUtcRange(zones) {
  if (!Array.isArray(zones) || zones.length === 0) return "UTC+0";
  const jan = new Date(Date.UTC(2026, 0, 15, 12, 0, 0));
  const jul = new Date(Date.UTC(2026, 6, 15, 12, 0, 0));
  let min = Infinity;
  let max = -Infinity;
  for (const z of zones) {
    for (const d of [jan, jul]) {
      const m = offsetMinutesForZone(z, d);
      if (m !== null) {
        if (m < min) min = m;
        if (m > max) max = m;
      }
    }
  }
  if (!Number.isFinite(min)) return "UTC+0";
  return "UTC" + utcFmt(min) + (max !== min ? "~" + utcFmt(max) : "");
}

const CURATED_REGIONS = [
  // Latinoamérica & Caribe
  {
    name: "España",
    iso: "es",
    mcc: "214",
    utc: "UTC+0~+2",
    zones: ["Europe/Madrid", "Atlantic/Canary"],
    locales: ["es-ES", "ca-ES", "eu-ES", "gl-ES"],
    carriers: "Movistar/Orange/Vodafone ES/MásMóvil",
    note: "Incluye Península (CET/CEST) y Canarias (WET/WEST)",
  },
  {
    name: "Estados Unidos",
    iso: "us",
    mcc: "310-316",
    utc: "UTC-4~-10",
    zones: [
      "America/New_York",
      "America/Chicago",
      "America/Denver",
      "America/Los_Angeles",
      "America/Phoenix",
      "America/Anchorage",
      "Pacific/Honolulu",
    ],
    locales: ["en-US", "es-US"],
    carriers: "Verizon/AT&T/T-Mobile",
    note: "Múltiples husos horarios; CSC=XAA/ATT/TMB/VZW",
  },
  {
    name: "México",
    iso: "mx",
    mcc: "334",
    utc: "UTC-5~-8",
    zones: [
      "America/Mexico_City",
      "America/Monterrey",
      "America/Cancun",
      "America/Tijuana",
      "America/Hermosillo",
      "America/Chihuahua",
    ],
    locales: ["es-MX"],
    carriers: "Telcel/AT&T MX/Movistar",
    note: "Cuatro zonas horarias incluyendo Zona Fronteriza",
  },
  {
    name: "Argentina",
    iso: "ar",
    mcc: "722",
    utc: "UTC-3",
    zones: ["America/Argentina/Buenos_Aires", "America/Buenos_Aires", "America/Argentina/Cordoba"],
    locales: ["es-AR"],
    carriers: "Personal/Claro AR/Movistar",
    note: "Huso fijo UTC-3 sin DST; alias IANA America/Buenos_Aires",
  },
  {
    name: "Colombia",
    iso: "co",
    mcc: "732",
    utc: "UTC-5",
    zones: ["America/Bogota"],
    locales: ["es-CO"],
    carriers: "Claro CO/Movistar/Tigo/WOM",
    note: "Huso fijo UTC-5 sin horario de verano",
  },
  {
    name: "Chile",
    iso: "cl",
    mcc: "730",
    utc: "UTC-3~-6",
    zones: ["America/Santiago", "America/Punta_Arenas", "Pacific/Easter"],
    locales: ["es-CL"],
    carriers: "Entel/Movistar/Claro CL/WOM",
    note: "Continental (UTC-4/-3), Magallanes (UTC-3) e Isla de Pascua",
  },
  {
    name: "Perú",
    iso: "pe",
    mcc: "716",
    utc: "UTC-5",
    zones: ["America/Lima"],
    locales: ["es-PE"],
    carriers: "Claro PE/Movistar/Entel/Bitel",
    note: "Huso fijo UTC-5",
  },
  {
    name: "Venezuela",
    iso: "ve",
    mcc: "734",
    utc: "UTC-4",
    zones: ["America/Caracas"],
    locales: ["es-VE"],
    carriers: "Movilnet/Movistar VE/Digitel",
    note: "Huso fijo UTC-4 (VET)",
  },
  {
    name: "Brasil",
    iso: "br",
    mcc: "724",
    utc: "UTC-2~-5",
    zones: [
      "America/Sao_Paulo",
      "America/Manaus",
      "America/Belem",
      "America/Fortaleza",
      "America/Rio_Branco",
      "America/Noronha",
    ],
    locales: ["pt-BR"],
    carriers: "Claro/Vivo/TIM",
    note: "CSC=ZTO/ZVV; cuatro husos horarios",
  },
  {
    name: "Ecuador",
    iso: "ec",
    mcc: "740",
    utc: "UTC-5~-6",
    zones: ["America/Guayaquil", "Pacific/Galapagos"],
    locales: ["es-EC"],
    carriers: "Claro EC/Movistar/CNT",
    note: "Continental UTC-5 y Galápagos UTC-6",
  },
  {
    name: "Uruguay",
    iso: "uy",
    mcc: "748",
    utc: "UTC-3",
    zones: ["America/Montevideo"],
    locales: ["es-UY"],
    carriers: "Antel/Movistar UY/Claro UY",
    note: "Huso fijo UTC-3",
  },
  {
    name: "Paraguay",
    iso: "py",
    mcc: "744",
    utc: "UTC-3~-4",
    zones: ["America/Asuncion"],
    locales: ["es-PY"],
    carriers: "Tigo/Personal PY/Claro PY/VOX",
    note: "UTC-3 permanente desde 2024",
  },
  {
    name: "Bolivia",
    iso: "bo",
    mcc: "736",
    utc: "UTC-4",
    zones: ["America/La_Paz"],
    locales: ["es-BO"],
    carriers: "Entel BO/Tigo BO/Viva",
    note: "Huso fijo UTC-4",
  },
  {
    name: "Costa Rica",
    iso: "cr",
    mcc: "712",
    utc: "UTC-6",
    zones: ["America/Costa_Rica"],
    locales: ["es-CR"],
    carriers: "Kölbi/Liberty/Claro CR",
    note: "Huso fijo UTC-6",
  },
  {
    name: "Panamá",
    iso: "pa",
    mcc: "714",
    utc: "UTC-5",
    zones: ["America/Panama"],
    locales: ["es-PA"],
    carriers: "+Móvil/Tigo PA",
    note: "Huso fijo UTC-5",
  },
  {
    name: "República Dominicana",
    iso: "do",
    mcc: "370",
    utc: "UTC-4",
    zones: ["America/Santo_Domingo"],
    locales: ["es-DO"],
    carriers: "Claro DO/Altice/Viva DO",
    note: "Huso fijo UTC-4",
  },
  {
    name: "Guatemala",
    iso: "gt",
    mcc: "704",
    utc: "UTC-6",
    zones: ["America/Guatemala"],
    locales: ["es-GT"],
    carriers: "Tigo GT/Claro GT",
    note: "Huso fijo UTC-6",
  },
  {
    name: "Honduras",
    iso: "hn",
    mcc: "708",
    utc: "UTC-6",
    zones: ["America/Tegucigalpa"],
    locales: ["es-HN"],
    carriers: "Tigo HN/Claro HN",
    note: "Huso fijo UTC-6",
  },
  {
    name: "El Salvador",
    iso: "sv",
    mcc: "706",
    utc: "UTC-6",
    zones: ["America/El_Salvador"],
    locales: ["es-SV"],
    carriers: "Tigo SV/Claro SV/Movistar SV",
    note: "Huso fijo UTC-6",
  },
  {
    name: "Nicaragua",
    iso: "ni",
    mcc: "710",
    utc: "UTC-6",
    zones: ["America/Managua"],
    locales: ["es-NI"],
    carriers: "Claro NI/Tigo NI",
    note: "Huso fijo UTC-6",
  },
  {
    name: "Cuba",
    iso: "cu",
    mcc: "368",
    utc: "UTC-4~-5",
    zones: ["America/Havana"],
    locales: ["es-CU"],
    carriers: "ETECSA (Cubacel)",
    note: "EST/EDT UTC-5 / UTC-4",
  },
  {
    name: "Canadá",
    iso: "ca",
    mcc: "302",
    utc: "UTC-2:30~-8",
    zones: [
      "America/Toronto",
      "America/Winnipeg",
      "America/Edmonton",
      "America/Vancouver",
      "America/Halifax",
      "America/St_Johns",
    ],
    locales: ["en-CA", "fr-CA"],
    carriers: "Rogers/Bell/Telus",
    note: "CSC=XAC/RWC/BMC/TLA; incluye Terranova UTC-3:30/-2:30",
  },

  // Europa
  {
    name: "Reino Unido",
    iso: "gb",
    mcc: "234/235",
    utc: "UTC+0~+1",
    zones: ["Europe/London"],
    locales: ["en-GB"],
    carriers: "EE/O2/VodafoneUK/Three",
    note: "CSC=BTU/EEA/O2U/H3G; alias uk",
  },
  {
    name: "Alemania",
    iso: "de",
    mcc: "262",
    utc: "UTC+1~+2",
    zones: ["Europe/Berlin", "Europe/Busingen"],
    locales: ["de-DE"],
    carriers: "Telekom/Vodafone/O2",
    note: "CSC=DBT/VD2/O2C",
  },
  {
    name: "Francia",
    iso: "fr",
    mcc: "208",
    utc: "UTC+1~+2",
    zones: ["Europe/Paris"],
    locales: ["fr-FR"],
    carriers: "Orange/SFR/Bouygues/Free",
    note: "CSC=XEF/ORO/SFR/BOG",
  },
  {
    name: "Italia",
    iso: "it",
    mcc: "222",
    utc: "UTC+1~+2",
    zones: ["Europe/Rome"],
    locales: ["it-IT"],
    carriers: "TIM/Vodafone IT/WindTre/Iliad",
    note: "CET/CEST",
  },
  {
    name: "Portugal",
    iso: "pt",
    mcc: "268",
    utc: "UTC-1~+1",
    zones: ["Europe/Lisbon", "Atlantic/Madeira", "Atlantic/Azores"],
    locales: ["pt-PT"],
    carriers: "MEO/NOS/Vodafone PT",
    note: "Continental WET/WEST y Azores",
  },
  {
    name: "Países Bajos",
    iso: "nl",
    mcc: "204",
    utc: "UTC+1~+2",
    zones: ["Europe/Amsterdam"],
    locales: ["nl-NL", "en-NL"],
    carriers: "KPN/VodafoneZiggo/Odido",
    note: "Alias holland; nodo VPN frecuente en Europa",
  },
  {
    name: "Suiza",
    iso: "ch",
    mcc: "228",
    utc: "UTC+1~+2",
    zones: ["Europe/Zurich"],
    locales: ["de-CH", "fr-CH", "it-CH"],
    carriers: "Swisscom/Sunrise/Salt",
    note: "Múltiples idiomas locales oficiales",
  },
  {
    name: "Suecia",
    iso: "se",
    mcc: "240",
    utc: "UTC+1~+2",
    zones: ["Europe/Stockholm"],
    locales: ["sv-SE"],
    carriers: "Telia/Tele2/Tre/Telenor SE",
    note: "CET/CEST",
  },
  {
    name: "Noruega",
    iso: "no",
    mcc: "242",
    utc: "UTC+1~+2",
    zones: ["Europe/Oslo", "Arctic/Longyearbyen"],
    locales: ["nb-NO", "nn-NO"],
    carriers: "Telenor/Telia NO/Ice",
    note: "CET/CEST",
  },
  {
    name: "Dinamarca",
    iso: "dk",
    mcc: "238",
    utc: "UTC+1~+2",
    zones: ["Europe/Copenhagen"],
    locales: ["da-DK"],
    carriers: "TDC/Telenor DK/Telia DK/3",
    note: "CET/CEST",
  },
  {
    name: "Finlandia",
    iso: "fi",
    mcc: "244",
    utc: "UTC+2~+3",
    zones: ["Europe/Helsinki", "Europe/Mariehamn"],
    locales: ["fi-FI", "sv-FI"],
    carriers: "Elisa/Telia FI/DNA",
    note: "EET/EEST",
  },
  {
    name: "Polonia",
    iso: "pl",
    mcc: "260",
    utc: "UTC+1~+2",
    zones: ["Europe/Warsaw"],
    locales: ["pl-PL"],
    carriers: "Orange PL/Play/Plus/T-Mobile PL",
    note: "CET/CEST",
  },
  {
    name: "Chequia",
    iso: "cz",
    mcc: "230",
    utc: "UTC+1~+2",
    zones: ["Europe/Prague"],
    locales: ["cs-CZ"],
    carriers: "T-Mobile CZ/O2 CZ/Vodafone CZ",
    note: "Alias czech",
  },
  {
    name: "Austria",
    iso: "at",
    mcc: "232",
    utc: "UTC+1~+2",
    zones: ["Europe/Vienna"],
    locales: ["de-AT"],
    carriers: "A1/Magenta/Drei",
    note: "CET/CEST",
  },
  {
    name: "Bélgica",
    iso: "be",
    mcc: "206",
    utc: "UTC+1~+2",
    zones: ["Europe/Brussels"],
    locales: ["nl-BE", "fr-BE", "de-BE"],
    carriers: "Proximus/Orange BE/Base",
    note: "CET/CEST",
  },
  {
    name: "Irlanda",
    iso: "ie",
    mcc: "272",
    utc: "UTC+0~+1",
    zones: ["Europe/Dublin"],
    locales: ["en-IE", "ga-IE"],
    carriers: "Vodafone IE/Three IE/Eir",
    note: "IST/GMT",
  },
  {
    name: "Rumania",
    iso: "ro",
    mcc: "226",
    utc: "UTC+2~+3",
    zones: ["Europe/Bucharest"],
    locales: ["ro-RO"],
    carriers: "Orange RO/Vodafone RO/Digi",
    note: "EET/EEST; presencia frecuente de hosting/M247",
  },
  {
    name: "Grecia",
    iso: "gr",
    mcc: "202",
    utc: "UTC+2~+3",
    zones: ["Europe/Athens"],
    locales: ["el-GR"],
    carriers: "Cosmote/Vodafone GR/Nova",
    note: "EET/EEST",
  },
  {
    name: "Turquía",
    iso: "tr",
    mcc: "286",
    utc: "UTC+3",
    zones: ["Europe/Istanbul", "Asia/Istanbul"],
    locales: ["tr-TR"],
    carriers: "Turkcell/Vodafone/TürkTelekom",
    note: "CSC=TUR; UTC+3 permanente",
  },
  {
    name: "Ucrania",
    iso: "ua",
    mcc: "255",
    utc: "UTC+2~+3",
    zones: ["Europe/Kyiv", "Europe/Kiev"],
    locales: ["uk-UA", "ru-UA"],
    carriers: "Kyivstar/Vodafone UA/lifecell",
    note: "EET/EEST; alias Europe/Kiev",
  },

  // Medio Oriente & África
  {
    name: "Emiratos Árabes Unidos",
    iso: "ae",
    mcc: "424/430",
    utc: "UTC+4",
    zones: ["Asia/Dubai"],
    locales: ["ar-AE", "en-AE"],
    carriers: "e&(Etisalat)/du",
    note: "CSC=XSG; alias uae",
  },
  {
    name: "Arabia Saudita",
    iso: "sa",
    mcc: "420",
    utc: "UTC+3",
    zones: ["Asia/Riyadh"],
    locales: ["ar-SA"],
    carriers: "STC/Mobily/Zain SA",
    note: "Huso fijo UTC+3",
  },
  {
    name: "Israel",
    iso: "il",
    mcc: "425",
    utc: "UTC+2~+3",
    zones: ["Asia/Jerusalem", "Asia/Tel_Aviv"],
    locales: ["he-IL", "ar-IL", "en-IL"],
    carriers: "Cellcom/Partner/Pelephone",
    note: "IST/IDT",
  },
  {
    name: "Egipto",
    iso: "eg",
    mcc: "602",
    utc: "UTC+2~+3",
    zones: ["Africa/Cairo"],
    locales: ["ar-EG"],
    carriers: "Vodafone EG/Orange EG/Etisalat/WE",
    note: "EET/EEST",
  },
  {
    name: "Sudáfrica",
    iso: "za",
    mcc: "655",
    utc: "UTC+2",
    zones: ["Africa/Johannesburg"],
    locales: ["en-ZA", "af-ZA", "zu-ZA"],
    carriers: "Vodacom/MTN/Cell C",
    note: "CSC=XFA/XFE; SAST UTC+2",
  },
  {
    name: "Nigeria",
    iso: "ng",
    mcc: "621",
    utc: "UTC+1",
    zones: ["Africa/Lagos"],
    locales: ["en-NG"],
    carriers: "MTN NG/Airtel NG/Glo/9mobile",
    note: "WAT UTC+1",
  },

  // Asia-Pacífico
  {
    name: "Japón",
    iso: "jp",
    mcc: "440/441",
    utc: "UTC+9",
    zones: ["Asia/Tokyo"],
    locales: ["ja-JP"],
    carriers: "docomo/au/SoftBank/Rakuten",
    note: "CSC=DCM/KDI/SBM/RKT",
  },
  {
    name: "Corea del Sur",
    iso: "kr",
    mcc: "450",
    utc: "UTC+9",
    zones: ["Asia/Seoul"],
    locales: ["ko-KR"],
    carriers: "SKT/KT/LG U+",
    note: "CSC=SKC/KTC/LUC/KOO; alias korea",
  },
  {
    name: "Singapur",
    iso: "sg",
    mcc: "525",
    utc: "UTC+8",
    zones: ["Asia/Singapore"],
    locales: ["en-SG", "zh-SG", "ms-SG"],
    carriers: "Singtel/StarHub/M1/SIMBA",
    note: "CSC=XSP/MM1",
  },
  {
    name: "Malasia",
    iso: "my",
    mcc: "502",
    utc: "UTC+8",
    zones: ["Asia/Kuala_Lumpur", "Asia/Kuching"],
    locales: ["ms-MY", "en-MY", "zh-MY"],
    carriers: "Maxis/CelcomDigi/U Mobile",
    note: "CSC=XME",
  },
  {
    name: "Indonesia",
    iso: "id",
    mcc: "510",
    utc: "UTC+7~+9",
    zones: ["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura", "Asia/Pontianak"],
    locales: ["id-ID"],
    carriers: "Telkomsel/XL/Indosat",
    note: "Tres husos WIB/WITA/WIT; CSC=XID",
  },
  {
    name: "Vietnam",
    iso: "vn",
    mcc: "452",
    utc: "UTC+7",
    zones: ["Asia/Ho_Chi_Minh", "Asia/Saigon"],
    locales: ["vi-VN"],
    carriers: "Viettel/Vinaphone/Mobifone",
    note: "CSC=XXV; alias Asia/Saigon",
  },
  {
    name: "Filipinas",
    iso: "ph",
    mcc: "515",
    utc: "UTC+8",
    zones: ["Asia/Manila"],
    locales: ["en-PH", "fil-PH"],
    carriers: "Globe/Smart/DITO",
    note: "CSC=XTC/XTE",
  },
  {
    name: "Tailandia",
    iso: "th",
    mcc: "520",
    utc: "UTC+7",
    zones: ["Asia/Bangkok"],
    locales: ["th-TH"],
    carriers: "AIS/TrueMove H/dtac",
    note: "CSC=THL",
  },
  {
    name: "India",
    iso: "in",
    mcc: "404/405",
    utc: "UTC+5:30",
    zones: ["Asia/Kolkata", "Asia/Calcutta"],
    locales: ["en-IN", "hi-IN"],
    carriers: "Jio/Airtel/Vi",
    note: "CSC=INS/INU; alias Asia/Calcutta",
  },
  {
    name: "Taiwán",
    iso: "tw",
    mcc: "466",
    utc: "UTC+8",
    zones: ["Asia/Taipei"],
    locales: ["zh-TW"],
    carriers: "Chunghwa/Taiwan Mobile/FarEasTone",
    note: "CSC=TWN/BRI",
  },
  {
    name: "Hong Kong",
    iso: "hk",
    mcc: "454",
    utc: "UTC+8",
    zones: ["Asia/Hong_Kong"],
    locales: ["zh-HK", "en-HK"],
    carriers: "CSL/3HK/SmarTone/CMHK",
    note: "CSC=TGY",
  },
  {
    name: "China",
    iso: "cn",
    mcc: "460",
    utc: "UTC+8",
    zones: ["Asia/Shanghai", "Asia/Urumqi"],
    locales: ["zh-CN"],
    carriers: "China Mobile/China Unicom/China Telecom",
    note: "CSC=CHC/CHM",
  },
  {
    name: "Mongolia",
    iso: "mn",
    mcc: "496",
    utc: "UTC+7~+8",
    zones: ["Asia/Ulaanbaatar", "Asia/Hovd", "Asia/Choibalsan"],
    locales: ["mn-MN"],
    carriers: "Mobicom/Unitel/Skytel",
    note: "CSC=MGL",
  },
  {
    name: "Australia",
    iso: "au",
    mcc: "505",
    utc: "UTC+8~+11",
    zones: [
      "Australia/Sydney",
      "Australia/Melbourne",
      "Australia/Brisbane",
      "Australia/Adelaide",
      "Australia/Darwin",
      "Australia/Perth",
      "Australia/Hobart",
    ],
    locales: ["en-AU"],
    carriers: "Telstra/Optus/VodafoneAU",
    note: "Múltiples husos; CSC=XSA/TEL/OPS/VAU",
  },
  {
    name: "Nueva Zelanda",
    iso: "nz",
    mcc: "530",
    utc: "UTC+12~+13:45",
    zones: ["Pacific/Auckland", "Pacific/Chatham"],
    locales: ["en-NZ"],
    carriers: "Spark/One NZ/2degrees",
    note: "CSC=XNZ; incluye Islas Chatham",
  },
];

const SUPPORTED = [
  "al","dz","ad","ao","ag","ar","am","au","at","az","bs","bh","bd","bb",
  "be","bz","bj","bt","bo","ba","bw","br","bn","bg","bf","bi","kh","cm",
  "ca","cv","td","cl","co","km","cg","cr","hr","cy","cz","dk","dj",
  "dm","do","tl","ec","eg","sv","gq","ee","sz","fj","fi","fr","ga","gm",
  "ge","de","gh","gr","gd","gt","gn","gw","gy","ht","hn","hu","is","in",
  "id","iq","ie","il","it","ci","jm","jp","jo","kz","ke","ki","kw","kg",
  "la","lv","lb","ls","lr","li","lt","lu","mg","mw","my","mv","mt","mp",
  "mh","mr","mu","mx","fm","md","mc","mn","me","ma","mz","na","nr","np",
  "nl","nz","ni","ne","ng","mk","no","om","pk","pw","ps","pa","pg","py",
  "pe","ph","pl","pt","qa","ro","rw","kn","lc","vc","ws","sm","st","sa",
  "sn","rs","sc","sl","sg","sk","si","sb","za","kr","es","lk","sr","se",
  "ch","tw","tj","tz","th","tg","to","tt","tn","tr","tm","tv","ug","ua",
  "ae","gb","us","uy","uz","vu","va","vn","zm","zw",
];

// Reverse map ISO2 -> canonical IANA zones from Intl.supportedValuesOf('timeZone')
const CANONICAL_ZONES = typeof Intl.supportedValuesOf === "function"
  ? Intl.supportedValuesOf("timeZone")
  : [];

const ZONES_BY_ISO = new Map();
for (const zone of CANONICAL_ZONES) {
  const countries = IANA_TO_COUNTRY.get(zone) ?? [];
  for (const iso of countries) {
    if (!ZONES_BY_ISO.has(iso)) ZONES_BY_ISO.set(iso, []);
    ZONES_BY_ISO.get(iso).push(zone);
  }
}
for (const [zone, countries] of IANA_TO_COUNTRY_ENTRIES) {
  for (const iso of countries) {
    if (!ZONES_BY_ISO.has(iso)) ZONES_BY_ISO.set(iso, []);
    const list = ZONES_BY_ISO.get(iso);
    if (!list.includes(zone)) list.push(zone);
  }
}

const displayNamesEs = new Intl.DisplayNames(["es"], { type: "region" });
const displayNamesEn = new Intl.DisplayNames(["en"], { type: "region" });

function likelyLang(iso) {
  try {
    const maximized = new Intl.Locale(`und-${iso.toUpperCase()}`).maximize();
    const lang = maximized.language;
    return !lang || lang === "und" ? "" : lang;
  } catch {
    return "";
  }
}

function autoRegion(iso) {
  const upper = iso.toUpperCase();
  let name = upper;
  try {
    name = displayNamesEs.of(upper) || displayNamesEn.of(upper) || upper;
  } catch {
    name = upper;
  }
  const zones = ZONES_BY_ISO.get(iso) ?? ["UTC"];
  const lang = likelyLang(iso);
  const locales =
    !lang || lang === "en"
      ? [`en-${upper}`]
      : [`${lang}-${upper}`, `en-${upper}`];
  return {
    name,
    iso,
    mcc: "",
    utc: computeUtcRange(zones),
    zones,
    locales,
    carriers: "",
    note: "",
  };
}

const curatedSet = new Set(CURATED_REGIONS.map((r) => r.iso));
const generatedRegions = SUPPORTED.filter((iso) => !curatedSet.has(iso)).map(autoRegion);

export const REGIONS = Object.freeze([...CURATED_REGIONS, ...generatedRegions]);

const REGION_BY_ISO = new Map(REGIONS.map((r) => [r.iso, r]));

/**
 * Look up a region entry by ISO2 code or common alias ("uk"->"gb", "usa"->"us", etc.).
 * @param {string} iso
 * @returns {{ name: string, iso: string, mcc: string, utc: string, zones: string[], locales: string[], carriers: string, note: string }|null}
 */
export function getRegionByIso(iso) {
  if (typeof iso !== "string") return null;
  const key = iso.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (!key) return null;
  const resolved = REGION_ALIASES.get(key) ?? key;
  return REGION_BY_ISO.get(resolved) ?? null;
}
