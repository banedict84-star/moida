(function(root){
 'use strict';
 function value(v){if(typeof v==='string')return v.trim();if(v&&typeof v==='object')return value(v.place_name)||value(v.name)||value(v.address_name)||value(v.formatted_address)||value(v.address);return '';}
 function read(event){if(!event)return '';var fields=[event._location,event.location,event.place,event.address,event.schedule?.place,event.schedule?.location];for(var f of fields){var location=value(f);if(location)return location;}
  for(var body of [event._body,event.body,event.eventBody,event.memo,event.content]){if(typeof body!=='string')continue;var plain=body.replace(/<br\s*\/?>/gi,'\n').replace(/<\/p\s*>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ');var match=plain.match(/(?:^|\n)\s*(?:장소|행사\s*장소|개최\s*장소|위치)\s*(?:[:：]\s*|[ \t]+)([^\n]+)/);if(match&&match[1].trim())return match[1].trim();}
  return '';
 }
 root.moidaSchedulePlace={read:read};
})(window);
