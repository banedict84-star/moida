import {unzipSync, strFromU8} from 'fflate';
import {XMLParser} from 'fast-xml-parser';

const arr = value => value == null ? [] : Array.isArray(value) ? value : [value];
const text = value => typeof value === 'object' && value !== null ? String(value['#text'] ?? '') : String(value ?? '');
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const compact = value => clean(value).replace(/\s/g, '');
const dongs = ['일동', '이동', '성포동'];
const dayMs = 86400000;
const dateString = timestamp => new Date(timestamp).toISOString().slice(0, 10);

function readSheets(input) {
  let size = 0;
  const files = unzipSync(new Uint8Array(input), {filter: file => {
    size += file.originalSize;
    if (size > 12 * 1024 * 1024 || file.originalSize > 4 * 1024 * 1024) throw Error('엑셀 압축 해제 크기 제한');
    return /^xl\/(sharedStrings.xml|workbook.xml|worksheets\/sheet\d+.xml)$/.test(file.name);
  }});
  const parser = new XMLParser({ignoreAttributes: false, parseTagValue: false, processEntities: false});
  function xml(name) {
    const source = files[name] ? strFromU8(files[name]) : '';
    if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw Error('허용하지 않는 XML');
    return source ? parser.parse(source) : {};
  }
  if (['1', 'true'].includes(xml('xl/workbook.xml').workbook?.workbookPr?.['@_date1904'])) throw Error('1904 날짜 형식은 확인이 필요합니다.');
  const strings = arr(xml('xl/sharedStrings.xml').sst?.si).map(si => si.t !== undefined ? text(si.t) : arr(si.r).map(run => text(run.t)).join(''));
  return Object.keys(files).filter(name => name.startsWith('xl/worksheets/')).map(name => {
    const sheet = xml(name).worksheet;
    const rows = arr(sheet?.sheetData?.row).map(row => {
      const values = [];
      for (const cell of arr(row.c)) {
        const letters = String(cell['@_r'] || '').match(/^[A-Z]+/)?.[0];
        if (!letters) continue;
        let column = 0;
        for (const letter of letters) column = column * 26 + letter.charCodeAt(0) - 64;
        if (column > 100) continue;
        values[column - 1] = cell['@_t'] === 's' ? strings[Number(cell.v)] : cell['@_t'] === 'inlineStr' ? text(cell.is?.t) : cell.v;
      }
      return values;
    });
    return rows;
  });
}

function serialDate(value) {
  const serial = Number(value);
  if (!Number.isFinite(serial) || serial < 40000 || serial > 80000) return '';
  return dateString(Date.UTC(1899, 11, 30) + Math.floor(serial) * dayMs);
}

function startTime(date, value, allowText = false) {
  const raw = clean(value);
  if (!raw) throw Error('대상 일정의 날짜·시간 확인이 필요합니다.');
  const clock = allowText ? raw.match(/^(\d{1,2}):(\d{2})(?::00)?$/) : null;
  const fraction = Number(raw);
  const minutes = clock && Number(clock[2]) < 60 ? Number(clock[1]) * 60 + Number(clock[2]) :
    Number.isFinite(fraction) && fraction >= 0 && fraction < 1 ? Math.round(fraction * 1440) : NaN;
  if (!date || !Number.isInteger(minutes) || minutes < 0 || minutes >= 1440) throw Error('대상 일정의 날짜·시간 확인이 필요합니다.');
  return date + 'T' + String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0') + ':00+09:00';
}

function parseDongSheet(rows, targetDongs) {
  const header = rows.findIndex(row => row.some(value => compact(value) === '부서명') && row.some(value => compact(value) === '행사명'));
  if (header < 0) return null;
  const columns = rows[header].map(compact);
  const [dateCol, timeCol, dongCol, titleCol, placeCol, bodyCol] = ['날짜', '시', '부서명', '행사명', '장소', '주요내용'].map(name => columns.indexOf(name));
  if ([dateCol, timeCol, dongCol, titleCol, placeCol].includes(-1)) throw Error('동별 일정 열 구성이 달라 확인이 필요합니다.');
  return rows.slice(header + 1).filter(row => targetDongs.includes(clean(row[dongCol]))).map(row => {
    const date = serialDate(row[dateCol]);
    const title = clean(row[titleCol]);
    const location = clean(row[placeCol]);
    if (!title || !location) throw Error('제목 또는 장소가 비어 있습니다.');
    return {dong: clean(row[dongCol]), date, start: startTime(date, row[timeCol]), title, location, description: clean(row[bodyCol])};
  });
}

function majorCityEvent(title, location, notes) {
  if (/^(간부회의|주간업무보고|월간업무보고)$|내부회의|자체회의/.test(compact(title))) return false;
  if (/(?:^|[^가-힣])(?:안산)?시장(?:님)?\s*(?:참석|주재|인사말|축사|표창)|주요\s*행사/.test(notes)) return true;
  if (/^(시장실|부시장실|대회의실|상황실|제\d회의실)$/.test(compact(location)) && /정기회의|심사|점검|업무보고/.test(title)) return false;
  return /축제|기념식|개막식|개회식|폐막식|준공식|점등식|시상식|수여식|설명회|공청회|토론회|박람회|심포지|업무협약|시장군수협의회|장학금.{0,5}기부|체육대회|안산시장배/.test(compact(title));
}

function parseCitySheet(rows) {
  const header = rows.findIndex(row => {
    const names = row.map(compact);
    return ['월일', '시간', '행사명', '장소', '주관'].every(name => names.includes(name));
  });
  if (header < 0 || !rows.slice(0, header).flat().some(value => /주간행사계획/.test(compact(value)))) return null;
  const columns = rows[header].map(compact);
  const [dateCol, timeCol, titleCol, placeCol, hostCol, notesCol] = ['월일', '시간', '행사명', '장소', '주관', '비고'].map(name => columns.indexOf(name));
  const week = rows.slice(0, header).flat().map(clean).join(' ').match(/(20\d{2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})\s*\./);
  if (!week) throw Error('본청 주간행사계획의 시작 날짜를 확인할 수 없습니다.');
  const weekStart = Date.UTC(Number(week[1]), Number(week[2]) - 1, Number(week[3]));
  const dates = Array.from({length: 7}, (_, index) => dateString(weekStart + index * dayMs));
  let date = '';
  const events = [];
  let warnings = 0;
  for (const row of rows.slice(header + 1)) {
    const day = clean(row[dateCol]);
    if (day) {
      const parts = day.match(/^(\d{1,2})\s*[/.]\s*(\d{1,2})(?:\D|$)/);
      const suffix = parts && '-' + parts[1].padStart(2, '0') + '-' + parts[2].padStart(2, '0');
      date = serialDate(day) || (suffix ? dates.find(value => value.endsWith(suffix)) : '') || '';
    }
    const title = clean(row[titleCol]);
    if (!title || ![timeCol, placeCol, hostCol].some(column => clean(row[column]))) continue;
    if (!dates.includes(date)) {
      warnings++;
      continue;
    }
    const location = clean(row[placeCol]);
    const notes = clean(row[notesCol]);
    const host = clean(row[hostCol]);
    const weekday = new Date(date + 'T12:00:00Z').getUTCDay();
    if (weekday !== 0 && weekday !== 6 && !majorCityEvent(title, location, notes)) continue;
    try {
      const start = startTime(date, row[timeCol], true);
      events.push({dong: '안산시', date, start, title, location, description: [host && '주관: ' + host, notes].filter(Boolean).join('\n')});
    } catch {
      warnings++;
    }
  }
  return {events, warnings};
}

export function extractDongEvents(input, targetDongs = dongs) {
  const matches = readSheets(input).map(rows => parseDongSheet(rows, targetDongs)).filter(Boolean);
  return {recognized: matches.length > 0, events: matches.flat()};
}

export function extractWeeklyEvents(input, filename) {
  const events = [];
  let recognized = false;
  let warnings = 0;
  const cityFile = /본청|안산시\s*(?:전체|주간\s*행사)|시\s*전체/.test(filename);
  for (const rows of readSheets(input)) {
    const districtEvents = parseDongSheet(rows, dongs);
    if (districtEvents) {
      recognized = true;
      events.push(...districtEvents);
    }
    if (cityFile) {
      const city = parseCitySheet(rows);
      if (!city) continue;
      recognized = true;
      events.push(...city.events);
      warnings += city.warnings;
    }
  }
  return {recognized, events, warnings};
}
