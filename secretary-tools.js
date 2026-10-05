// Existing Moida tools, adapted to the Agents API function schema.
export const SECRETARY_TOOLS = [
  {
    "type": "function",
    "name": "list_contacts",
    "description": "CRM에 등록된 연락처 명부와 인원수를 조회한다. 유형·행정동 필터와 오늘 생일 조회가 가능하다. CRM 관련 질문에는 추측하지 말고 이 도구를 사용한다.",
    "parameters": {
      "type": "object",
      "properties": {
        "type": {
          "type": "string",
          "description": "연락처 유형 필터"
        },
        "dong": {
          "type": "string",
          "description": "행정동·지역 필터"
        },
        "birthday_today": {
          "type": "boolean",
          "description": "오늘 생일인 연락처만 조회"
        },
        "limit": {
          "type": "number",
          "description": "반환할 최대 인원(기본 20, 최대 100)"
        }
      }
    }
  },
  {
    "type": "function",
    "name": "search_contacts",
    "description": "등록 연락처(지지자·당원·후원자)를 이름/연락처/행정동/추천인으로 검색",
    "parameters": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "검색어"
        }
      },
      "required": [
        "query"
      ]
    }
  },
  {
    "type": "function",
    "name": "add_contact",
    "description": "새 연락처(당원/지지자)를 등록",
    "parameters": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string"
        },
        "phone": {
          "type": "string"
        },
        "type": {
          "type": "string",
          "enum": [
            "권리당원",
            "일반당원",
            "신규당원",
            "탈당자",
            "일반시민",
            "기타"
          ]
        },
        "dong": {
          "type": "string",
          "description": "행정동"
        },
        "rec": {
          "type": "string",
          "description": "추천인"
        }
      },
      "required": [
        "name"
      ]
    }
  },
  {
    "type": "function",
    "name": "list_complaints",
    "description": "민원 목록 조회(상태로 필터 가능)",
    "parameters": {
      "type": "object",
      "properties": {
        "status": {
          "type": "string",
          "enum": [
            "접수",
            "처리중",
            "답변완료",
            "종결"
          ]
        }
      }
    }
  },
  {
    "type": "function",
    "name": "add_complaint",
    "description": "새 민원을 등록",
    "parameters": {
      "type": "object",
      "properties": {
        "title": {
          "type": "string"
        },
        "field": {
          "type": "string",
          "description": "분야"
        },
        "name": {
          "type": "string",
          "description": "민원인"
        },
        "priority": {
          "type": "string",
          "enum": [
            "긴급",
            "중요",
            "일반"
          ]
        },
        "status": {
          "type": "string",
          "enum": [
            "접수",
            "처리중",
            "답변완료",
            "종결"
          ]
        }
      },
      "required": [
        "title"
      ]
    }
  },
  {
    "type": "function",
    "name": "update_complaint_status",
    "description": "민원 상태 변경(제목 일부로 찾음)",
    "parameters": {
      "type": "object",
      "properties": {
        "title": {
          "type": "string"
        },
        "status": {
          "type": "string",
          "enum": [
            "접수",
            "처리중",
            "답변완료",
            "종결"
          ]
        }
      },
      "required": [
        "title",
        "status"
      ]
    }
  },
  {
    "type": "function",
    "name": "list_schedule",
    "description": "일정 조회(날짜 YYYY-MM-DD로 필터 가능)",
    "parameters": {
      "type": "object",
      "properties": {
        "date": {
          "type": "string"
        }
      }
    }
  },
  {
    "type": "function",
    "name": "add_event",
    "description": "일정 정보를 사용자에게 제안한다. 반환된 requires_confirmation이 true이면 등록 완료가 아니며 사용자가 등록 버튼으로 확인해야 한다.",
    "parameters": {
      "type": "object",
      "properties": {
        "title": {
          "type": "string"
        },
        "date": {
          "type": "string",
          "description": "YYYY-MM-DD"
        },
        "time": {
          "type": "string",
          "description": "HH:MM, 종일 일정이면 빈 문자열"
        },
        "end_time": {
          "type": "string",
          "description": "HH:MM, 생략하면 시작 1시간 뒤"
        },
        "duration_minutes": {
          "type": "number",
          "description": "종료 시각이 없을 때 사용할 일정 길이(기본 60분)"
        },
        "cat": {
          "type": "string",
          "enum": [
            "의정",
            "지역",
            "외부"
          ]
        },
        "location": {
          "type": "string"
        },
        "description": {
          "type": "string",
          "description": "일정 메모 또는 준비사항"
        },
        "all_day": {
          "type": "boolean",
          "description": "종일 일정 여부"
        }
      },
      "required": [
        "title",
        "date"
      ]
    }
  },
  {
    "type": "function",
    "name": "list_policies",
    "description": "발의 법안/정책 목록 조회",
    "parameters": {
      "type": "object",
      "properties": {}
    }
  },
  {
    "type": "function",
    "name": "list_notices",
    "description": "중앙당·경기도당·경기도의회 등 외부 기관 공지사항 조회(최신순). 출처/검색어로 필터 가능.",
    "parameters": {
      "type": "object",
      "properties": {
        "source": {
          "type": "string",
          "enum": [
            "중앙당",
            "경기도당",
            "경기도의회"
          ]
        },
        "query": {
          "type": "string",
          "description": "제목 검색어"
        },
        "limit": {
          "type": "number",
          "description": "개수(기본 10)"
        }
      }
    }
  },
  {
    "type": "function",
    "name": "create_poster",
    "description": "홍보용 웹자보를 코드 템플릿으로 생성한다(1080x1350 PNG, 더불어민주당 네이비 스타일). 제목·슬로건·일시·장소·주최·문의를 정확히 표기하고, 사진은 사용자가 첨부한 현장 사진 + 설정에 등록된 의원 사진을 그대로 사용한다(AI가 새로 그리지 않음 → 글자·얼굴 정확). 반드시 임팩트 있는 한 줄 슬로건(message)을 넣는다.",
    "parameters": {
      "type": "object",
      "properties": {
        "title": {
          "type": "string",
          "description": "핵심 제목/주제(짧게)"
        },
        "message": {
          "type": "string",
          "description": "핵심 메시지·슬로건 한 문장"
        },
        "category": {
          "type": "string",
          "description": "상단 분류 배지(예: 의정활동·행사안내·정책)"
        },
        "date": {
          "type": "string",
          "description": "일시"
        },
        "place": {
          "type": "string",
          "description": "장소"
        },
        "host": {
          "type": "string",
          "description": "주최"
        },
        "phone": {
          "type": "string",
          "description": "문의 연락처"
        },
        "position": {
          "type": "string",
          "description": "의원 직함·소속(미지정 시 프로필 사용)"
        },
        "region": {
          "type": "string",
          "description": "하단 지역 표기"
        },
        "template_key": {
          "type": "string",
          "description": "디자인 템플릿 키(기본 navy). 추가 템플릿 생기면 선택"
        }
      },
      "required": [
        "title",
        "message"
      ]
    }
  },
  {
    "type": "function",
    "name": "delegate_work",
    "description": "정책·일정·민원·홍보 등 여러 단계가 필요한 업무를 의원실 팀장과 담당자에게 배정한다. 반환된 작업 ID로 read_work_report를 조회하여 검수 완료 여부를 확인한다. 접수는 완료가 아니다.",
    "parameters": {
      "type": "object",
      "properties": {
        "instruction": {
          "type": "string"
        }
      },
      "required": [
        "instruction"
      ]
    }
  },
  {
    "type": "function",
    "name": "read_work_report",
    "description": "배정한 업무의 진행 상태와 팀장 검수 보고를 조회한다. completed이고 summary가 있어야 완료 보고한다. 진행 중이면 현재 상태와 작업 ID를 안내한다.",
    "parameters": {
      "type": "object",
      "properties": {
        "run_id": {
          "type": "string"
        }
      },
      "required": [
        "run_id"
      ]
    }
  }
];
