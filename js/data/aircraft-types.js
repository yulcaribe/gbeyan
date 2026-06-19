'use strict';

const AIRCRAFT_TYPES = [
  {
    "value": "A320-200",
    "label": "Airbus A320-200",
    "optionalLabel": "DAR"
  },
  {
    "value": "A320-186C",
    "label": "Airbus A320-186C",
    "optionalLabel": "DAR"
  },
  {
    "value": "A321-200",
    "label": "Airbus A321-200",
    "optionalLabel": "DAR"
  },
  {
    "value": "A320-186",
    "label": "Airbus A320-186",
    "optionalLabel": "DAR"
  },
  {
    "value": "A3ST-ABB",
    "label": "Airbus A300-600ST \"Super Transporter\" / \"Beluga\"",
    "optionalLabel": "GENIS"
  },
  {
    "value": "A19N-31N",
    "label": "Airbus A319neo",
    "optionalLabel": "DAR"
  },
  {
    "value": "A20N-32N",
    "label": "Airbus A320neo",
    "optionalLabel": "DAR"
  },
  {
    "value": "A21N-32Q",
    "label": "Airbus A321neo",
    "optionalLabel": "DAR"
  },
  {
    "value": "A30B-AB4",
    "label": "Airbus A300B2, A300B4, and A300C4",
    "optionalLabel": "GENIS"
  },
  {
    "value": "A35K-351",
    "label": "Airbus A350-1000",
    "optionalLabel": "GENIS"
  },
  {
    "value": "A124-A4F",
    "label": "Antonov An-124 Ruslan",
    "optionalLabel": "DAR"
  },
  {
    "value": "A140-A40",
    "label": "Antonov An-140",
    "optionalLabel": "DAR"
  },
  {
    "value": "A148-A81",
    "label": "Antonov An-148",
    "optionalLabel": "DAR"
  },
  {
    "value": "A158-A58",
    "label": "Antonov An-158",
    "optionalLabel": "DAR"
  },
  {
    "value": "A306-AB6",
    "label": "Airbus A300-600",
    "optionalLabel": "DAR"
  },
  {
    "value": "A306-ABY",
    "label": "Airbus A300-600 Freighter",
    "optionalLabel": "GENIS"
  },
  {
    "value": "A310-312",
    "label": "Airbus A310-200",
    "optionalLabel": "GENIS"
  },
  {
    "value": "A310-313",
    "label": "Airbus A310-300",
    "optionalLabel": "GENIS"
  },
  {
    "value": "A318-318",
    "label": "Airbus A318",
    "optionalLabel": "DAR"
  },
  {
    "value": "A318-32C",
    "label": "Airbus A318 (sharklets)",
    "optionalLabel": "DAR"
  },
  {
    "value": "A319-319",
    "label": "Airbus A319",
    "optionalLabel": "DAR"
  },
  {
    "value": "A319-32D",
    "label": "Airbus A319 (sharklets)",
    "optionalLabel": "DAR"
  },
  {
    "value": "A320-320",
    "label": "Airbus A320",
    "optionalLabel": "DAR"
  },
  {
    "value": "A320-32A",
    "label": "Airbus A320 (sharklets)",
    "optionalLabel": "DAR"
  },
  {
    "value": "A321-321",
    "label": "Airbus A321",
    "optionalLabel": "DAR"
  },
  {
    "value": "A321-32B",
    "label": "Airbus A321 (sharklets)",
    "optionalLabel": "DAR"
  },
  {
    "value": "A332-332",
    "label": "Airbus A330-200",
    "optionalLabel": "GENIS"
  },
  {
    "value": "A332-33X",
    "label": "Airbus A330-200 Freighter",
    "optionalLabel": "GENIS"
  },
  {
    "value": "A333-333",
    "label": "Airbus A330-300",
    "optionalLabel": "GENIS"
  },
  {
    "value": "A333-33Y",
    "label": "Airbus A330-300 Freighter",
    "optionalLabel": "GENIS"
  },
  {
    "value": "A338-338",
    "label": "Airbus A330-800",
    "optionalLabel": "GENIS"
  },
  {
    "value": "A339-339",
    "label": "Airbus A330-900",
    "optionalLabel": "GENIS"
  },
  {
    "value": "A342-342",
    "label": "Airbus A340-200",
    "optionalLabel": "GENIS"
  },
  {
    "value": "A343-343",
    "label": "Airbus A340-300",
    "optionalLabel": "GENIS"
  },
  {
    "value": "A345-345",
    "label": "Airbus A340-500",
    "optionalLabel": "GENIS"
  },
  {
    "value": "A346-346",
    "label": "Airbus A340-600",
    "optionalLabel": "GENIS"
  },
  {
    "value": "A359-359",
    "label": "Airbus A350-900",
    "optionalLabel": "GENIS"
  },
  {
    "value": "A388-388",
    "label": "Airbus A380-800",
    "optionalLabel": "GENIS"
  },
  {
    "value": "A400-400",
    "label": "Airbus A400M Atlas",
    "optionalLabel": "GENIS"
  },
  {
    "value": "AJ27-C27",
    "label": "COMAC ARJ21",
    "optionalLabel": "DAR"
  },
  {
    "value": "AN12-ANF",
    "label": "Antonov An-12",
    "optionalLabel": "DAR"
  },
  {
    "value": "AN24-AN4",
    "label": "Antonov An-24",
    "optionalLabel": "DAR"
  },
  {
    "value": "AN26-A26",
    "label": "Antonov An-26",
    "optionalLabel": "DAR"
  },
  {
    "value": "AN28-A28",
    "label": "Antonov An-28",
    "optionalLabel": "DAR"
  },
  {
    "value": "AN30-A30",
    "label": "Antonov An-30",
    "optionalLabel": "DAR"
  },
  {
    "value": "AN32-A32",
    "label": "Antonov An-32",
    "optionalLabel": "DAR"
  },
  {
    "value": "AN72-AN7",
    "label": "Antonov An-72 / An-74",
    "optionalLabel": "DAR"
  },
  {
    "value": "AT43-AT4",
    "label": "Aerospatiale/Alenia ATR 42-300 / 320",
    "optionalLabel": "DAR"
  },
  {
    "value": "AT45-AT5",
    "label": "Aerospatiale/Alenia ATR 42-500",
    "optionalLabel": "DAR"
  },
  {
    "value": "AT46-ATR",
    "label": "Aerospatiale/Alenia ATR 42-600",
    "optionalLabel": "DAR"
  },
  {
    "value": "AT72-AT7",
    "label": "Aerospatiale/Alenia ATR 72-201/-202",
    "optionalLabel": "DAR"
  },
  {
    "value": "AT73-ATR",
    "label": "Aerospatiale/Alenia ATR 72-211/-212",
    "optionalLabel": "DAR"
  },
  {
    "value": "AT75-ATR",
    "label": "Aerospatiale/Alenia ATR 72-212A (500)",
    "optionalLabel": "DAR"
  },
  {
    "value": "AT76-ATR",
    "label": "Aerospatiale/Alenia ATR 72-212A (600)",
    "optionalLabel": "DAR"
  },
  {
    "value": "ATP-ATP",
    "label": "British Aerospace ATP",
    "optionalLabel": "DAR"
  },
  {
    "value": "B3XM-7MJ",
    "label": "Boeing 737 MAX 10",
    "optionalLabel": "DAR"
  },
  {
    "value": "B37M-7M7",
    "label": "Boeing 737 MAX 7",
    "optionalLabel": "DAR"
  },
  {
    "value": "B38M-7M8",
    "label": "Boeing 737 MAX 8",
    "optionalLabel": "DAR"
  },
  {
    "value": "B39M-7M9",
    "label": "Boeing 737 MAX 9",
    "optionalLabel": "DAR"
  },
  {
    "value": "B74R-74R",
    "label": "Boeing 747SR",
    "optionalLabel": "GENIS"
  },
  {
    "value": "B74R-74V",
    "label": "Boeing 747SR Freighter",
    "optionalLabel": "GENIS"
  },
  {
    "value": "B74S-74L",
    "label": "Boeing 747SP",
    "optionalLabel": "GENIS"
  },
  {
    "value": "B77L-77X",
    "label": "Boeing 777-200 Freighter",
    "optionalLabel": "GENIS"
  },
  {
    "value": "B77L-77L",
    "label": "Boeing 777-200LR",
    "optionalLabel": "GENIS"
  },
  {
    "value": "B77W-77W",
    "label": "Boeing 777-300ER",
    "optionalLabel": "GENIS"
  },
  {
    "value": "B78X-781",
    "label": "Boeing 787-10",
    "optionalLabel": "GENIS"
  },
  {
    "value": "B703-703",
    "label": "Boeing 707",
    "optionalLabel": "DAR"
  },
  {
    "value": "B712-717",
    "label": "Boeing 717",
    "optionalLabel": "DAR"
  },
  {
    "value": "B720-B72",
    "label": "Boeing 720B",
    "optionalLabel": "DAR"
  },
  {
    "value": "B721-721",
    "label": "Boeing 727-100",
    "optionalLabel": "DAR"
  },
  {
    "value": "B722-722",
    "label": "Boeing 727-200",
    "optionalLabel": "DAR"
  },
  {
    "value": "B732-732",
    "label": "Boeing 737-200",
    "optionalLabel": "DAR"
  },
  {
    "value": "B732-73F",
    "label": "Boeing 737-200 Freighter",
    "optionalLabel": "DAR"
  },
  {
    "value": "B733-733",
    "label": "Boeing 737-300",
    "optionalLabel": "DAR"
  },
  {
    "value": "B733-73C",
    "label": "Boeing 737-300 Winglets",
    "optionalLabel": "DAR"
  },
  {
    "value": "B733-73Y",
    "label": "Boeing 737-300 Freighter",
    "optionalLabel": "DAR"
  },
  {
    "value": "B734-734",
    "label": "Boeing 737-400",
    "optionalLabel": "DAR"
  },
  {
    "value": "B734-73P",
    "label": "Boeing 737-400 Freighter",
    "optionalLabel": "DAR"
  },
  {
    "value": "B735-735",
    "label": "Boeing 737-500",
    "optionalLabel": "DAR"
  },
  {
    "value": "B735-73E",
    "label": "Boeing 737-500 Winglets",
    "optionalLabel": "DAR"
  },
  {
    "value": "B736-736",
    "label": "Boeing 737-600",
    "optionalLabel": "DAR"
  },
  {
    "value": "B737-73G",
    "label": "Boeing 737-700 / Boeing 737-700ER",
    "optionalLabel": "DAR"
  },
  {
    "value": "B737-73W",
    "label": "Boeing 737-700 Winglets",
    "optionalLabel": "DAR"
  },
  {
    "value": "B738-738",
    "label": "Boeing 737-800",
    "optionalLabel": "DAR"
  },
  {
    "value": "B738-73H",
    "label": "Boeing 737-800 Winglets",
    "optionalLabel": "DAR"
  },
  {
    "value": "B738-73K",
    "label": "Boeing 737-800 Freighter Winglets",
    "optionalLabel": "DAR"
  },
  {
    "value": "B738-73U",
    "label": "Boeing 737-800 Freighter",
    "optionalLabel": "DAR"
  },
  {
    "value": "B739-739",
    "label": "Boeing 737-900 / Boeing 737-900ER",
    "optionalLabel": "DAR"
  },
  {
    "value": "B739-73J",
    "label": "Boeing 737-900 Winglets",
    "optionalLabel": "DAR"
  },
  {
    "value": "B741-741",
    "label": "Boeing 747-100",
    "optionalLabel": "GENIS"
  },
  {
    "value": "B741-74T",
    "label": "Boeing 747-100 Freighter",
    "optionalLabel": "GENIS"
  },
  {
    "value": "B742-742",
    "label": "Boeing 747-200",
    "optionalLabel": "GENIS"
  },
  {
    "value": "B742-74C",
    "label": "Boeing 747-200M",
    "optionalLabel": "GENIS"
  },
  {
    "value": "B742-74X",
    "label": "Boeing 747-200F",
    "optionalLabel": "GENIS"
  },
  {
    "value": "B743-743",
    "label": "Boeing 747-300",
    "optionalLabel": "GENIS"
  },
  {
    "value": "B743-74D",
    "label": "Boeing 747-300M",
    "optionalLabel": "GENIS"
  },
  {
    "value": "B744-744",
    "label": "Boeing 747-400 / Boeing 747-400ER",
    "optionalLabel": "GENIS"
  },
  {
    "value": "B744-74E",
    "label": "Boeing 747-400M",
    "optionalLabel": "GENIS"
  },
  {
    "value": "B744-74Y",
    "label": "Boeing 747-400F / Boeing 747-400ERF",
    "optionalLabel": "GENIS"
  },
  {
    "value": "B748-74H",
    "label": "Boeing 747-8I",
    "optionalLabel": "GENIS"
  },
  {
    "value": "B748-74N",
    "label": "Boeing 747-8F",
    "optionalLabel": "GENIS"
  },
  {
    "value": "B752-752",
    "label": "Boeing 757-200",
    "optionalLabel": "GENIS"
  },
  {
    "value": "B752-75F",
    "label": "Boeing 757F",
    "optionalLabel": "DAR"
  },
  {
    "value": "B753-753",
    "label": "Boeing 757-300",
    "optionalLabel": "DAR"
  },
  {
    "value": "B762-762",
    "label": "Boeing 767-200 / Boeing 767-200ER",
    "optionalLabel": "GENIS"
  },
  {
    "value": "B762-76X",
    "label": "Boeing 767-200 Freighter / Boeing 767-200ER",
    "optionalLabel": "GENIS"
  },
  {
    "value": "B763-763",
    "label": "Boeing 767-300",
    "optionalLabel": "GENIS"
  },
  {
    "value": "B763-76W",
    "label": "Boeing 767-300 Winglets / Boeing 767-300ER",
    "optionalLabel": "DAR"
  },
  {
    "value": "B763-76Y",
    "label": "Boeing 767-300 Freighter",
    "optionalLabel": "GENIS"
  },
  {
    "value": "B764-764",
    "label": "Boeing 767-400ER",
    "optionalLabel": "GENIS"
  },
  {
    "value": "B772-772",
    "label": "Boeing 777-200 / Boeing 777-200ER",
    "optionalLabel": "GENIS"
  },
  {
    "value": "B773-773",
    "label": "Boeing 777-300",
    "optionalLabel": "GENIS"
  },
  {
    "value": "B778-778",
    "label": "Boeing 777-8",
    "optionalLabel": "GENIS"
  },
  {
    "value": "B779-779",
    "label": "Boeing 777-9",
    "optionalLabel": "GENIS"
  },
  {
    "value": "B788-788",
    "label": "Boeing 787-8",
    "optionalLabel": "GENIS"
  },
  {
    "value": "B789-789",
    "label": "Boeing 787-9",
    "optionalLabel": "GENIS"
  },
  {
    "value": "BA11-B11",
    "label": "British Aerospace (BAC) One Eleven",
    "optionalLabel": "DAR"
  },
  {
    "value": "BCS1-221",
    "label": "Airbus A220-100",
    "optionalLabel": "DAR"
  },
  {
    "value": "BCS3-223",
    "label": "Airbus A220-300",
    "optionalLabel": "DAR"
  },
  {
    "value": "C919-919",
    "label": "COMAC C919",
    "optionalLabel": "DAR"
  },
  {
    "value": "DC10-D11",
    "label": "Douglas DC-10-10 / -15 Passenger",
    "optionalLabel": "GENIS"
  },
  {
    "value": "E170-E70",
    "label": "Embraer 170",
    "optionalLabel": "DAR"
  },
  {
    "value": "E190-E90",
    "label": "Embraer 190 / Lineage 1000",
    "optionalLabel": "DAR"
  },
  {
    "value": "E195-E95",
    "label": "Embraer 195",
    "optionalLabel": "DAR"
  },
  {
    "value": "E290-290",
    "label": "Embraer E190-E2",
    "optionalLabel": "DAR"
  },
  {
    "value": "E295-295",
    "label": "Embraer E195-E2",
    "optionalLabel": "DAR"
  },
  {
    "value": "IL76-IL7",
    "label": "Ilyushin Il-76",
    "optionalLabel": "GENIS"
  },
  {
    "value": "IL86-ILW",
    "label": "Ilyushin Il-86",
    "optionalLabel": "GENIS"
  },
  {
    "value": "IL96-I93",
    "label": "Ilyushin Il-96",
    "optionalLabel": "GENIS"
  },
  {
    "value": "MD11-M11",
    "label": "McDonnell Douglas MD-11",
    "optionalLabel": "GENIS"
  },
  {
    "value": "MD11-M1F",
    "label": "McDonnell Douglas MD-11F",
    "optionalLabel": "GENIS"
  },
  {
    "value": "MD11-M1M",
    "label": "McDonnell Douglas MD-11C",
    "optionalLabel": "GENIS"
  },
  {
    "value": "MD81-M81",
    "label": "McDonnell Douglas MD-81",
    "optionalLabel": "DAR"
  },
  {
    "value": "MD82-M82",
    "label": "McDonnell Douglas MD-82",
    "optionalLabel": "DAR"
  },
  {
    "value": "MD83-M83",
    "label": "McDonnell Douglas MD-83",
    "optionalLabel": "DAR"
  },
  {
    "value": "MD87-M87",
    "label": "McDonnell Douglas MD-87",
    "optionalLabel": "DAR"
  },
  {
    "value": "MD88-M88",
    "label": "McDonnell Douglas MD-88",
    "optionalLabel": "DAR"
  },
  {
    "value": "MD90-M90",
    "label": "McDonnell Douglas MD-90",
    "optionalLabel": "DAR"
  },
  {
    "value": "SU95-SU9",
    "label": "Sukhoi Superjet 100-95",
    "optionalLabel": "DAR"
  },
  {
    "value": "OZEL-JET",
    "label": "Özel Uçak",
    "optionalLabel": "DAR"
  },
  {
    "value": "COPTER",
    "label": "Helikopter",
    "optionalLabel": "DAR"
  },
  {
    "value": "AIRTAXI",
    "label": "Hava Taksi",
    "optionalLabel": "DAR"
  }
];

const DEFAULT_AIRCRAFT_TYPE = 'OZEL-JET';

const AIRCRAFT_TYPE_ALIASES = {
  "A320-1": "A320-320",
  "A320-2": "A320-200",
  "A321-1": "A321-321",
  "A321-2": "A321-200",
  "A321NEO": "A21N-32Q",
  "A330-3": "A333-333",
  "A350-9": "A359-359",
  "B737-2": "B732-732",
  "B737-8": "B738-738",
  "B737-9": "B739-739",
  "B767-3": "B763-763",
  "B777-3": "B773-773",
  "SU95": "SU95-SU9",
  "C25C": "OZEL-JET",
  "CL850": "OZEL-JET",
  "G280": "OZEL-JET",
  "LJ60": "OZEL-JET",
  "ONSA": "OZEL-JET"
};

function normalizeAircraftTypeKey(v) {
  return String(v || '').trim().toUpperCase().replace(/\s+/g, '');
}

const AIRCRAFT_TYPE_MAP = AIRCRAFT_TYPES.reduce((acc, item) => {
  const valueKey = normalizeAircraftTypeKey(item.value);
  const labelKey = normalizeAircraftTypeKey(item.label);
  if (valueKey) acc[valueKey] = item.value;
  if (labelKey) acc[labelKey] = item.value;
  return acc;
}, { ...AIRCRAFT_TYPE_ALIASES });

function normalizeAircraftTypeValue(v) {
  return AIRCRAFT_TYPE_MAP[normalizeAircraftTypeKey(v)] || '';
}

function aircraftTypeDisplayLabel(item) {
  return [item.label, item.optionalLabel].filter(Boolean).join(' / ');
}

function buildAircraftTypeDatalistHtml(id = 'aircraftTypeOptions') {
  return `<datalist id="${escapeHtml(id)}">${AIRCRAFT_TYPES.map(item => {
    const label = aircraftTypeDisplayLabel(item);
    return `<option value="${escapeHtml(item.value)}" label="${escapeHtml(label)}"></option>`;
  }).join('')}</datalist>`;
}
