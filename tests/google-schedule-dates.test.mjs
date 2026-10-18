import test from 'node:test';
import assert from 'node:assert/strict';
import {monthGrid,eventOnDay,koreaDay} from '../google-schedule-dates.js';
test('달력은 일요일부터 시작하며 윤년과 여섯 주를 빠짐없이 표시한다',()=>{assert.equal(monthGrid('2026-08-01').length,42);assert.equal(monthGrid('2026-10-01')[0],'2026-09-27');assert.equal(monthGrid('2024-02-01').includes('2024-02-29'),true);});
test('한국 날짜와 자정 종료·여러 날 종일 일정을 정확하게 구분한다',()=>{assert.equal(koreaDay('2026-10-17T16:00:00Z'),'2026-10-18');const overnight={start:'2026-10-18T23:00:00+09:00',end:'2026-10-19T00:00:00+09:00'};assert(eventOnDay(overnight,'2026-10-18'));assert(!eventOnDay(overnight,'2026-10-19'));const all={allDay:true,start:'2026-10-18',end:'2026-10-21'};for(const day of ['18','19','20'])assert(eventOnDay(all,'2026-10-'+day));assert(!eventOnDay(all,'2026-10-21'));assert(!eventOnDay({...all,status:'cancelled'},'2026-10-18'));});
