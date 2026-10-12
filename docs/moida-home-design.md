# 모이다 홈페이지 · 2026-10-12

참고: https://sintra.ai/ — 사무실 배경의 큰 첫 화면, 역할별 직원 소개, 기능 시연, 연결 도구와 이용 방법으로 이어지는 구성.

모이다의 남색 #102C4B, 민트 #57D9C2, 따뜻한 흰색을 사용한다. 공개 홈페이지는 index.html이며 기존 인증 화면은 login.html에 유지한다. 기존 계정 및 인증 방식은 그대로 사용한다. 홈페이지의 기능 미리보기는 모두 예시 데이터이며 개인정보나 실제 업무 기록을 읽지 않는다.

기능 탭: 통화 기록 / 일정·행사 / 문자 발송 / 문서 만들기. 실제 업무 화면 링크를 제공하며, 미로그인 시 로그인 후 선택한 업무 화면으로 돌아온다. AI 직원 카드는 기존 사무실 직원 카탈로그의 이름과 이미지를 사용한다.

## 전용 이미지

- 경로: assets/moida-home-hero-v1.webp
- 생성 방식: 내장 image_gen 도구. 기존 secretary-avatar-office-v1.png를 인물 정체성 참고로 사용했다.
- 생성 프롬프트: A wide cinematic premium modern Korean office with warm afternoon light, walnut desk, ivory walls, soft green trees outside, a spacious dark navy left half for a white headline, and a friendly Korean male AI executive assistant in his early 30s in a navy suit at a laptop on the right half. Subtly stylized realistic 3D appearance, neat dark brown hair, gentle confident smile, mint accent objects. No text, logos, watermark or UI panels. Reference image is for secretary face and outfit only; create a new office scene.
- 원본은 생성 폴더에 보존하고 웹용 사본을 WebP로 저장했다.

## 확인

데스크톱 및 390px·320px 휴대폰 너비, 기능 탭 전환, FAQ, 휴대폰 메뉴, 회원가입 진입을 확인한다. 기존 로그인 함수와 Firebase 설정은 유지한다. 새로운 추적기나 외부 폼을 추가하지 않는다.
