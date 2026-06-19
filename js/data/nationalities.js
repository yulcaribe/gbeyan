'use strict';

const NATIONALITIES = [
  {
    "value": "GR",
    "label": "Yunanistan",
    "optionalLabel": null
  },
  {
    "value": "GS",
    "label": "Güney Georgia ve Güney Sandwich Ad.",
    "optionalLabel": null
  },
  {
    "value": "GT",
    "label": "Guatemala",
    "optionalLabel": null
  },
  {
    "value": "GU",
    "label": "Guam",
    "optionalLabel": null
  },
  {
    "value": "GW",
    "label": "Gine-Bissau",
    "optionalLabel": null
  },
  {
    "value": "GY",
    "label": "Guyana",
    "optionalLabel": null
  },
  {
    "value": "HK",
    "label": "Hong Kong",
    "optionalLabel": null
  },
  {
    "value": "HM",
    "label": "Heard Adası ve McDonald Adaları",
    "optionalLabel": null
  },
  {
    "value": "HN",
    "label": "Honduras",
    "optionalLabel": null
  },
  {
    "value": "HR",
    "label": "Hırvatistan",
    "optionalLabel": null
  },
  {
    "value": "HT",
    "label": "Haiti",
    "optionalLabel": null
  },
  {
    "value": "HU",
    "label": "Macaristan",
    "optionalLabel": null
  },
  {
    "value": "ID",
    "label": "Endonezya",
    "optionalLabel": null
  },
  {
    "value": "IE",
    "label": "İrlanda",
    "optionalLabel": null
  },
  {
    "value": "IL",
    "label": "İsrail",
    "optionalLabel": null
  },
  {
    "value": "IM",
    "label": "Isle of Man .{en}.",
    "optionalLabel": null
  },
  {
    "value": "IN",
    "label": "Hindistan",
    "optionalLabel": null
  },
  {
    "value": "IO",
    "label": "İngiliz Hint Okyanusu Toprağı",
    "optionalLabel": null
  },
  {
    "value": "IQ",
    "label": "Irak",
    "optionalLabel": null
  },
  {
    "value": "IR",
    "label": "İran (İslam Cumhuriyeti)",
    "optionalLabel": null
  },
  {
    "value": "IS",
    "label": "İzlanda",
    "optionalLabel": null
  },
  {
    "value": "IT",
    "label": "İtalya",
    "optionalLabel": null
  },
  {
    "value": "JE",
    "label": "Jersey .{en}.",
    "optionalLabel": null
  },
  {
    "value": "JM",
    "label": "Jamaika",
    "optionalLabel": null
  },
  {
    "value": "JO",
    "label": "Ürdün",
    "optionalLabel": null
  },
  {
    "value": "JP",
    "label": "Japonya",
    "optionalLabel": null
  },
  {
    "value": "KE",
    "label": "Kenya",
    "optionalLabel": null
  },
  {
    "value": "KG",
    "label": "Kırgızistan",
    "optionalLabel": null
  },
  {
    "value": "KH",
    "label": "Kamboçya",
    "optionalLabel": null
  },
  {
    "value": "KI",
    "label": "Kiribati",
    "optionalLabel": null
  },
  {
    "value": "KK",
    "label": "KUZEY KIBRIS TÜRK CUMHURİYETİ",
    "optionalLabel": null
  },
  {
    "value": "KM",
    "label": "Komor",
    "optionalLabel": null
  },
  {
    "value": "KN",
    "label": "St Kitts ve Nevis",
    "optionalLabel": null
  },
  {
    "value": "KP",
    "label": "Kuzey Kore",
    "optionalLabel": null
  },
  {
    "value": "KR",
    "label": "Güney Kore",
    "optionalLabel": null
  },
  {
    "value": "KW",
    "label": "Kuveyt",
    "optionalLabel": null
  },
  {
    "value": "KY",
    "label": "Kayman Adaları",
    "optionalLabel": null
  },
  {
    "value": "KZ",
    "label": "Kazakistan",
    "optionalLabel": null
  },
  {
    "value": "LA",
    "label": "Laos (Halk Demokratik Cumhuriyeti)",
    "optionalLabel": null
  },
  {
    "value": "LB",
    "label": "Lübnan",
    "optionalLabel": null
  },
  {
    "value": "LC",
    "label": "St Lucia",
    "optionalLabel": null
  },
  {
    "value": "LI",
    "label": "Lihtenştayn",
    "optionalLabel": null
  },
  {
    "value": "LK",
    "label": "Sri Lanka",
    "optionalLabel": null
  },
  {
    "value": "LR",
    "label": "Liberya",
    "optionalLabel": null
  },
  {
    "value": "LS",
    "label": "Lesotho",
    "optionalLabel": null
  },
  {
    "value": "LT",
    "label": "Litvanya",
    "optionalLabel": null
  },
  {
    "value": "LU",
    "label": "Lüksemburg",
    "optionalLabel": null
  },
  {
    "value": "LV",
    "label": "Letonya",
    "optionalLabel": null
  },
  {
    "value": "LY",
    "label": "Libya",
    "optionalLabel": null
  },
  {
    "value": "MA",
    "label": "Fas",
    "optionalLabel": null
  },
  {
    "value": "MC",
    "label": "Monaco Prensliği",
    "optionalLabel": null
  },
  {
    "value": "MD",
    "label": "Moldova (Cumhuriyeti)",
    "optionalLabel": null
  },
  {
    "value": "ME",
    "label": "Karadağ",
    "optionalLabel": null
  },
  {
    "value": "MF",
    "label": "Saint Martin (French part) .{en}.",
    "optionalLabel": null
  },
  {
    "value": "MG",
    "label": "Madagaskar",
    "optionalLabel": null
  },
  {
    "value": "MH",
    "label": "Marshall Adaları",
    "optionalLabel": null
  },
  {
    "value": "MK",
    "label": "Kuzey Makedonya",
    "optionalLabel": null
  },
  {
    "value": "ML",
    "label": "Mali",
    "optionalLabel": null
  },
  {
    "value": "MM",
    "label": "Myanmar",
    "optionalLabel": null
  },
  {
    "value": "MN",
    "label": "Moğolistan",
    "optionalLabel": null
  },
  {
    "value": "MO",
    "label": "Makao",
    "optionalLabel": null
  },
  {
    "value": "MP",
    "label": "Kuzey Mariana Adaları",
    "optionalLabel": null
  },
  {
    "value": "MQ",
    "label": "Martinique",
    "optionalLabel": null
  },
  {
    "value": "MR",
    "label": "Moritanya",
    "optionalLabel": null
  },
  {
    "value": "MS",
    "label": "Montserrat",
    "optionalLabel": null
  },
  {
    "value": "MT",
    "label": "Malta",
    "optionalLabel": null
  },
  {
    "value": "MU",
    "label": "Mauritius",
    "optionalLabel": null
  },
  {
    "value": "MV",
    "label": "Maldivler",
    "optionalLabel": null
  },
  {
    "value": "MW",
    "label": "Malavi",
    "optionalLabel": null
  },
  {
    "value": "MX",
    "label": "Meksika",
    "optionalLabel": null
  },
  {
    "value": "MY",
    "label": "Malezya",
    "optionalLabel": null
  },
  {
    "value": "MZ",
    "label": "Mozambik",
    "optionalLabel": null
  },
  {
    "value": "NA",
    "label": "Namibya",
    "optionalLabel": null
  },
  {
    "value": "NC",
    "label": "Yeni Kaledonya",
    "optionalLabel": null
  },
  {
    "value": "NE",
    "label": "Nijer",
    "optionalLabel": null
  },
  {
    "value": "NF",
    "label": "Norfolk Adası",
    "optionalLabel": null
  },
  {
    "value": "NG",
    "label": "Nijerya",
    "optionalLabel": null
  },
  {
    "value": "NI",
    "label": "Nikaragua",
    "optionalLabel": null
  },
  {
    "value": "NL",
    "label": "Hollanda",
    "optionalLabel": null
  },
  {
    "value": "NO",
    "label": "Norveç",
    "optionalLabel": null
  },
  {
    "value": "NP",
    "label": "Nepal",
    "optionalLabel": null
  },
  {
    "value": "NR",
    "label": "Nauru",
    "optionalLabel": null
  },
  {
    "value": "NU",
    "label": "Niue",
    "optionalLabel": null
  },
  {
    "value": "NZ",
    "label": "Yeni Zelanda",
    "optionalLabel": null
  },
  {
    "value": "OM",
    "label": "Umman",
    "optionalLabel": null
  },
  {
    "value": "PA",
    "label": "Panama",
    "optionalLabel": null
  },
  {
    "value": "PE",
    "label": "Peru",
    "optionalLabel": null
  },
  {
    "value": "PF",
    "label": "Fransız Polinezyası",
    "optionalLabel": null
  },
  {
    "value": "PG",
    "label": "Papua Yeni Gine",
    "optionalLabel": null
  },
  {
    "value": "PH",
    "label": "Filipinler",
    "optionalLabel": null
  },
  {
    "value": "PK",
    "label": "Pakistan",
    "optionalLabel": null
  },
  {
    "value": "PL",
    "label": "Polonya",
    "optionalLabel": null
  },
  {
    "value": "PM",
    "label": "Saint Pierre ve Mikelon",
    "optionalLabel": null
  },
  {
    "value": "PN",
    "label": "Pitcairn",
    "optionalLabel": null
  },
  {
    "value": "PR",
    "label": "Porto Riko",
    "optionalLabel": null
  },
  {
    "value": "PS",
    "label": "İşgal altındaki Filistin Toprağı",
    "optionalLabel": null
  },
  {
    "value": "PT",
    "label": "Portekiz",
    "optionalLabel": null
  },
  {
    "value": "PW",
    "label": "Palau",
    "optionalLabel": null
  },
  {
    "value": "PY",
    "label": "Paraguay",
    "optionalLabel": null
  },
  {
    "value": "QA",
    "label": "Katar",
    "optionalLabel": null
  },
  {
    "value": "QP",
    "label": "Açık Denizler",
    "optionalLabel": null
  },
  {
    "value": "QQ",
    "label": "Kumanya ve malzemeler",
    "optionalLabel": null
  },
  {
    "value": "QR",
    "label": "Topluluk içi kumanya ve malzemeler",
    "optionalLabel": null
  },
  {
    "value": "QS",
    "label": "Kumanya ve malzemeler, üç. ülkeler",
    "optionalLabel": null
  },
  {
    "value": "QU",
    "label": "Belirtilmeyen ülkeler",
    "optionalLabel": null
  },
  {
    "value": "QV",
    "label": "Belirtilmeyen ülkeler, Topluluk içi",
    "optionalLabel": null
  },
  {
    "value": "QW",
    "label": "Belirtilmeyen ülkeler, üç. ülkeler",
    "optionalLabel": null
  },
  {
    "value": "QX",
    "label": "Ticari/askeri neden. belir. ülkeler",
    "optionalLabel": null
  },
  {
    "value": "QY",
    "label": "Tic./ask. ned. belir. ül., Top. içi",
    "optionalLabel": null
  },
  {
    "value": "QZ",
    "label": "Tic./ask. ned. belir. ül., üç. ülk.",
    "optionalLabel": null
  },
  {
    "value": "RE",
    "label": "Reunion",
    "optionalLabel": null
  },
  {
    "value": "RO",
    "label": "Romanya",
    "optionalLabel": null
  },
  {
    "value": "RS",
    "label": "Sırbistan",
    "optionalLabel": null
  },
  {
    "value": "RU",
    "label": "Rusya Federasyonu",
    "optionalLabel": null
  },
  {
    "value": "RW",
    "label": "Ruanda",
    "optionalLabel": null
  },
  {
    "value": "SA",
    "label": "Suudi Arabistan",
    "optionalLabel": null
  },
  {
    "value": "SB",
    "label": "Solomon Adaları",
    "optionalLabel": null
  },
  {
    "value": "SC",
    "label": "Seyşeller",
    "optionalLabel": null
  },
  {
    "value": "SD",
    "label": "Sudan",
    "optionalLabel": null
  },
  {
    "value": "SE",
    "label": "İsveç",
    "optionalLabel": null
  },
  {
    "value": "SG",
    "label": "Singapur",
    "optionalLabel": null
  },
  {
    "value": "SH",
    "label": "Saint Helena",
    "optionalLabel": null
  },
  {
    "value": "SI",
    "label": "Slovenya",
    "optionalLabel": null
  },
  {
    "value": "SJ",
    "label": "Svalbard ve Jan Mayen Adaları",
    "optionalLabel": null
  },
  {
    "value": "SK",
    "label": "Slovakya",
    "optionalLabel": null
  },
  {
    "value": "SL",
    "label": "Sierra Leone",
    "optionalLabel": null
  },
  {
    "value": "SM",
    "label": "San Marino",
    "optionalLabel": null
  },
  {
    "value": "SN",
    "label": "Senegal",
    "optionalLabel": null
  },
  {
    "value": "SO",
    "label": "Somali",
    "optionalLabel": null
  },
  {
    "value": "SR",
    "label": "Surinam",
    "optionalLabel": null
  },
  {
    "value": "SS",
    "label": "Güney Sudan",
    "optionalLabel": null
  },
  {
    "value": "ST",
    "label": "Sao Tome ve Principe",
    "optionalLabel": null
  },
  {
    "value": "SV",
    "label": "El Salvador",
    "optionalLabel": null
  },
  {
    "value": "SX",
    "label": "Sint Maarten (Hollanda'ya ait bölümü)",
    "optionalLabel": null
  },
  {
    "value": "SY",
    "label": "Suriye Arap Cumhuriyeti",
    "optionalLabel": null
  },
  {
    "value": "SZ",
    "label": "Svaziland",
    "optionalLabel": null
  },
  {
    "value": "TC",
    "label": "Turks ve Caicos Adaları",
    "optionalLabel": null
  },
  {
    "value": "TD",
    "label": "Çad",
    "optionalLabel": null
  },
  {
    "value": "TF",
    "label": "Fransız Güney Toprakları",
    "optionalLabel": null
  },
  {
    "value": "TG",
    "label": "Togo",
    "optionalLabel": null
  },
  {
    "value": "TH",
    "label": "Tayland",
    "optionalLabel": null
  },
  {
    "value": "TJ",
    "label": "Tacikistan",
    "optionalLabel": null
  },
  {
    "value": "TK",
    "label": "Tokelau",
    "optionalLabel": null
  },
  {
    "value": "TL",
    "label": "Doğu Timor",
    "optionalLabel": null
  },
  {
    "value": "TM",
    "label": "Türkmenistan",
    "optionalLabel": null
  },
  {
    "value": "TN",
    "label": "Tunus",
    "optionalLabel": null
  },
  {
    "value": "TO",
    "label": "Tonga",
    "optionalLabel": null
  },
  {
    "value": "TR",
    "label": "Türkiye",
    "optionalLabel": null
  },
  {
    "value": "TT",
    "label": "Trinidad ve Tobago",
    "optionalLabel": null
  },
  {
    "value": "TV",
    "label": "Tuvalu",
    "optionalLabel": null
  },
  {
    "value": "TW",
    "label": "Tayvan",
    "optionalLabel": null
  },
  {
    "value": "TZ",
    "label": "Tanzanya (Birleşik Cumhuriyeti)",
    "optionalLabel": null
  },
  {
    "value": "UA",
    "label": "Ukrayna",
    "optionalLabel": null
  },
  {
    "value": "UG",
    "label": "Uganda",
    "optionalLabel": null
  },
  {
    "value": "UM",
    "label": "Birleşik Devletler Minor Outl. Ad.",
    "optionalLabel": null
  },
  {
    "value": "US",
    "label": "Birleşik Devletler",
    "optionalLabel": null
  },
  {
    "value": "UY",
    "label": "Uruguay",
    "optionalLabel": null
  },
  {
    "value": "UZ",
    "label": "Özbekistan",
    "optionalLabel": null
  },
  {
    "value": "VA",
    "label": "Vatikan",
    "optionalLabel": null
  },
  {
    "value": "VC",
    "label": "St Vincent ve Grenadinler",
    "optionalLabel": null
  },
  {
    "value": "VE",
    "label": "Venezuela",
    "optionalLabel": null
  },
  {
    "value": "VG",
    "label": "Virjin Adaları (İngiliz)",
    "optionalLabel": null
  },
  {
    "value": "VI",
    "label": "Virjin Adaları (ABD)",
    "optionalLabel": null
  },
  {
    "value": "VN",
    "label": "Vietnam",
    "optionalLabel": null
  },
  {
    "value": "VU",
    "label": "Vanuatu",
    "optionalLabel": null
  },
  {
    "value": "WF",
    "label": "Wallis ve Futuna",
    "optionalLabel": null
  },
  {
    "value": "WS",
    "label": "Samoa",
    "optionalLabel": null
  },
  {
    "value": "XC",
    "label": "Septe",
    "optionalLabel": null
  },
  {
    "value": "XI",
    "label": "Birleşik Krallık (Kuzey İrlanda)",
    "optionalLabel": null
  },
  {
    "value": "XK",
    "label": "Kosova",
    "optionalLabel": null
  },
  {
    "value": "XL",
    "label": "Melilla",
    "optionalLabel": null
  },
  {
    "value": "XS",
    "label": "Sırbistan",
    "optionalLabel": null
  },
  {
    "value": "YE",
    "label": "Yemen",
    "optionalLabel": null
  },
  {
    "value": "YT",
    "label": "Mayot",
    "optionalLabel": null
  },
  {
    "value": "ZA",
    "label": "Güney Afrika",
    "optionalLabel": null
  },
  {
    "value": "ZM",
    "label": "Zambia",
    "optionalLabel": null
  },
  {
    "value": "ZW",
    "label": "Zimbabve",
    "optionalLabel": null
  },
  {
    "value": "AD",
    "label": "Andorra",
    "optionalLabel": null
  },
  {
    "value": "AE",
    "label": "Birleşik Arap Emirlikleri",
    "optionalLabel": null
  },
  {
    "value": "AF",
    "label": "Afganistan",
    "optionalLabel": null
  },
  {
    "value": "AG",
    "label": "Antigua ve Barbuda",
    "optionalLabel": null
  },
  {
    "value": "AI",
    "label": "Anguilla",
    "optionalLabel": null
  },
  {
    "value": "AL",
    "label": "Arnavutluk",
    "optionalLabel": null
  },
  {
    "value": "AM",
    "label": "Ermenistan",
    "optionalLabel": null
  },
  {
    "value": "AO",
    "label": "Angola",
    "optionalLabel": null
  },
  {
    "value": "AQ",
    "label": "Antartika",
    "optionalLabel": null
  },
  {
    "value": "AR",
    "label": "Arjantin",
    "optionalLabel": null
  },
  {
    "value": "AS",
    "label": "Amerikan Samoası",
    "optionalLabel": null
  },
  {
    "value": "AT",
    "label": "Avusturya",
    "optionalLabel": null
  },
  {
    "value": "AU",
    "label": "Avustralya",
    "optionalLabel": null
  },
  {
    "value": "AW",
    "label": "Aruba",
    "optionalLabel": null
  },
  {
    "value": "AX",
    "label": "Aland Adaları",
    "optionalLabel": null
  },
  {
    "value": "AZ",
    "label": "Azerbaycan",
    "optionalLabel": null
  },
  {
    "value": "BA",
    "label": "Bosna ve Hersek",
    "optionalLabel": null
  },
  {
    "value": "BB",
    "label": "Barbados",
    "optionalLabel": null
  },
  {
    "value": "BD",
    "label": "Bangladeş",
    "optionalLabel": null
  },
  {
    "value": "BE",
    "label": "Belçika",
    "optionalLabel": null
  },
  {
    "value": "BF",
    "label": "Burkina Faso",
    "optionalLabel": null
  },
  {
    "value": "BG",
    "label": "Bulgaristan",
    "optionalLabel": null
  },
  {
    "value": "BH",
    "label": "Bahreyn",
    "optionalLabel": null
  },
  {
    "value": "BI",
    "label": "Burundi",
    "optionalLabel": null
  },
  {
    "value": "BJ",
    "label": "Benin",
    "optionalLabel": null
  },
  {
    "value": "BL",
    "label": "Saint Barthelemeu",
    "optionalLabel": null
  },
  {
    "value": "BM",
    "label": "Bermuda",
    "optionalLabel": null
  },
  {
    "value": "BN",
    "label": "Brunei",
    "optionalLabel": null
  },
  {
    "value": "BO",
    "label": "Bolivya",
    "optionalLabel": null
  },
  {
    "value": "BQ",
    "label": "Bonaire, Sint Eustatius ve Saba",
    "optionalLabel": null
  },
  {
    "value": "BR",
    "label": "Brezilya",
    "optionalLabel": null
  },
  {
    "value": "BS",
    "label": "Bahamalar",
    "optionalLabel": null
  },
  {
    "value": "BT",
    "label": "Bhutan",
    "optionalLabel": null
  },
  {
    "value": "BV",
    "label": "Bouvet Adası",
    "optionalLabel": null
  },
  {
    "value": "BW",
    "label": "Botsvana",
    "optionalLabel": null
  },
  {
    "value": "BY",
    "label": "Belarus",
    "optionalLabel": null
  },
  {
    "value": "BZ",
    "label": "Belize",
    "optionalLabel": null
  },
  {
    "value": "CA",
    "label": "Kanada",
    "optionalLabel": null
  },
  {
    "value": "CC",
    "label": "Kokos (Keeling) Adaları",
    "optionalLabel": null
  },
  {
    "value": "CD",
    "label": "Kongo (Demokratik Cumhuriyeti)",
    "optionalLabel": null
  },
  {
    "value": "CF",
    "label": "Orta Afrika Cumhuriyeti",
    "optionalLabel": null
  },
  {
    "value": "CG",
    "label": "Kongo",
    "optionalLabel": null
  },
  {
    "value": "CH",
    "label": "İsviçre",
    "optionalLabel": null
  },
  {
    "value": "CI",
    "label": "Fildişi Sahili",
    "optionalLabel": null
  },
  {
    "value": "CK",
    "label": "Cook Adaları",
    "optionalLabel": null
  },
  {
    "value": "CL",
    "label": "Şili",
    "optionalLabel": null
  },
  {
    "value": "CM",
    "label": "Kamerun",
    "optionalLabel": null
  },
  {
    "value": "CN",
    "label": "Çin Halk Cumhuriyeti",
    "optionalLabel": null
  },
  {
    "value": "CO",
    "label": "Kolombiya",
    "optionalLabel": null
  },
  {
    "value": "CR",
    "label": "Kosta Rika",
    "optionalLabel": null
  },
  {
    "value": "CU",
    "label": "Küba",
    "optionalLabel": null
  },
  {
    "value": "CV",
    "label": "Cape Verde",
    "optionalLabel": null
  },
  {
    "value": "CW",
    "label": "Kuruçao",
    "optionalLabel": null
  },
  {
    "value": "CX",
    "label": "Christmas Adası",
    "optionalLabel": null
  },
  {
    "value": "CY",
    "label": "Kıbrıs",
    "optionalLabel": null
  },
  {
    "value": "CZ",
    "label": "Çekya",
    "optionalLabel": null
  },
  {
    "value": "DE",
    "label": "Almanya",
    "optionalLabel": null
  },
  {
    "value": "DJ",
    "label": "Cibuti",
    "optionalLabel": null
  },
  {
    "value": "DK",
    "label": "Danimarka",
    "optionalLabel": null
  },
  {
    "value": "DM",
    "label": "Dominika",
    "optionalLabel": null
  },
  {
    "value": "DO",
    "label": "Dominik Cumhuriyeti",
    "optionalLabel": null
  },
  {
    "value": "DZ",
    "label": "Cezayir",
    "optionalLabel": null
  },
  {
    "value": "EC",
    "label": "Ekvator",
    "optionalLabel": null
  },
  {
    "value": "EE",
    "label": "Estonya",
    "optionalLabel": null
  },
  {
    "value": "EG",
    "label": "Mısır",
    "optionalLabel": null
  },
  {
    "value": "EH",
    "label": "Batı Sahara",
    "optionalLabel": null
  },
  {
    "value": "ER",
    "label": "Eritre",
    "optionalLabel": null
  },
  {
    "value": "ES",
    "label": "İspanya",
    "optionalLabel": null
  },
  {
    "value": "ET",
    "label": "Etiyopya",
    "optionalLabel": null
  },
  {
    "value": "EU",
    "label": "Avrupa Topluluğu",
    "optionalLabel": null
  },
  {
    "value": "FI",
    "label": "Finlandiya",
    "optionalLabel": null
  },
  {
    "value": "FJ",
    "label": "Fiji",
    "optionalLabel": null
  },
  {
    "value": "FK",
    "label": "Falkland Adaları",
    "optionalLabel": null
  },
  {
    "value": "FM",
    "label": "Mikronezya (Federal Devletleri)",
    "optionalLabel": null
  },
  {
    "value": "FO",
    "label": "Faroe Adaları",
    "optionalLabel": null
  },
  {
    "value": "FR",
    "label": "Fransa",
    "optionalLabel": null
  },
  {
    "value": "GA",
    "label": "Gabon",
    "optionalLabel": null
  },
  {
    "value": "GB",
    "label": "Birleşik Krallık",
    "optionalLabel": null
  },
  {
    "value": "GD",
    "label": "Grenada",
    "optionalLabel": null
  },
  {
    "value": "GE",
    "label": "Gürcistan",
    "optionalLabel": null
  },
  {
    "value": "GF",
    "label": "Fransız Guyanası",
    "optionalLabel": null
  },
  {
    "value": "GG",
    "label": "Guernsey .{en}.",
    "optionalLabel": null
  },
  {
    "value": "GH",
    "label": "Gana",
    "optionalLabel": null
  },
  {
    "value": "GI",
    "label": "Cebelitarık",
    "optionalLabel": null
  },
  {
    "value": "GL",
    "label": "Grönland",
    "optionalLabel": null
  },
  {
    "value": "GM",
    "label": "Gambiya",
    "optionalLabel": null
  },
  {
    "value": "GN",
    "label": "Gine",
    "optionalLabel": null
  },
  {
    "value": "GP",
    "label": "Guadalupe",
    "optionalLabel": null
  },
  {
    "value": "GQ",
    "label": "Ekvator Ginesi",
    "optionalLabel": null
  }
];

const NATIONALITY_CODE_SET = new Set(NATIONALITIES.map(item => item.value));

const NATIONALITY_PREFIX_MAP = {
  "TC": "TR",
  "RA": "RU",
  "LZ": "BG",
  "ER": "MD",
  "YR": "RO",
  "SP": "PL",
  "LY": "LT",
  "9H": "MT",
  "SE": "SE",
  "OM": "SK",
  "LN": "NO",
  "CF": "CA"
};

const NATIONALITY_ALIASES = {
  "TR": "TR",
  "TUR": "TR",
  "TURKISH": "TR",
  "TURKEY": "TR",
  "TURKIYE": "TR",
  "TURKIYECUMHURIYETI": "TR",
  "IR": "IR",
  "IRN": "IR",
  "IRAN": "IR",
  "IRANIAN": "IR",
  "IT": "IT",
  "ITA": "IT",
  "ITALY": "IT",
  "ITALIAN": "IT",
  "US": "US",
  "USA": "US",
  "AMERICAN": "US",
  "UNITEDSTATES": "US",
  "UNITEDSTATESOFAMERICA": "US",
  "DE": "DE",
  "DEU": "DE",
  "GERMANY": "DE",
  "GERMAN": "DE",
  "RU": "RU",
  "RUS": "RU",
  "RUSSIA": "RU",
  "RUSSIAN": "RU",
  "GB": "GB",
  "GBR": "GB",
  "UK": "GB",
  "BRITISH": "GB",
  "UNITEDKINGDOM": "GB",
  "FR": "FR",
  "FRA": "FR",
  "FRANCE": "FR",
  "FRENCH": "FR"
};

function normalizeNationalityKey(v) {
  return String(v || '')
    .trim()
    .replace(/[\u00c7\u00e7]/g, 'C')
    .replace(/[\u011e\u011f]/g, 'G')
    .replace(/[\u0130I\u0131i]/g, 'I')
    .replace(/[\u00d6\u00f6]/g, 'O')
    .replace(/[\u015e\u015f]/g, 'S')
    .replace(/[\u00dc\u00fc]/g, 'U')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
}

const NATIONALITY_NAME_MAP = NATIONALITIES.reduce((acc, item) => {
  acc[normalizeNationalityKey(item.value)] = item.value;
  acc[normalizeNationalityKey(item.label)] = item.value;
  return acc;
}, { ...NATIONALITY_ALIASES });

function isKnownNationalityCode(code) {
  return NATIONALITY_CODE_SET.has(String(code || '').toUpperCase());
}

function buildNationalityDatalistHtml(id = 'nationalityOptions') {
  return `<datalist id="${escapeHtml(id)}">${NATIONALITIES.map(item => {
    return `<option value="${escapeHtml(item.value)}" label="${escapeHtml(item.label)}"></option>`;
  }).join('')}</datalist>`;
}
