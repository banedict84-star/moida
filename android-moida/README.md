# 모이다 Android 앱

Android 8 이상. 패키지 `kr.moida.office`이며 통화 연결 앱과 별도로 설치된다.

앱 실행 시 운영 사이트를 Custom Tab으로 연다. Google 로그인, 사진 선택, 영상 녹화/다운로드, 위치 권한은 기본 브라우저가 처리한다. 별도 WebView에 로그인하거나 비밀번호/API 키를 앱에 넣지 않는다. 호환되는 최신 Chrome 또는 Samsung Internet이 필요하다. 브라우저에 따라 상단에 사이트 주소/메뉴가 표시된다. 설치 후 실제 휴대폰에서 로그인·영상 저장을 확인해야 한다.

사이트를 APK에 복사하지 않으므로 웹 수정 후 재설치가 필요 없다. 다음 실행은 새로운 HTML 주소를 요청한다. 열려 있는 페이지는 작업 유실을 막기 위해 강제 새로고침하지 않는다. 브라우저 메뉴의 새로고침으로 최신 페이지를 불러올 수 있다. 웹 자산 버전은 웹 배포 시 갱신해야 한다.

APK 변경은 GitHub Release의 버전 정보를 확인하여 안내한다. 새 APK 설치에는 사용자의 Android 설치 확인이 필요하다. 현재 패키지나 앱 서명과 다른 APK로 자동 교체하지 않는다. 자동 무인 설치나 네이티브 통화·위치 수집은 제공하지 않는다.

## 빌드

JDK 17, Gradle 8.7, Android SDK 34. `gradle :app:testReleaseUnitTest :app:lintRelease :app:assembleRelease`. GitHub Actions `Build Moida Android app`에서 서명·테스트·배포한다. 릴리스는 `moida-app-latest`와 버전별 태그로 배포한다. 설치 파일에는 debug 기능이 비활성화되어 있다.

업데이트 시 `app/build.gradle`의 versionCode/versionName을 증가시킨다. 최초 서명 키는 GitHub Actions 캐시 `moida-office-signing-v1`에 보존한다. 서명 키가 사라졌고 기존 릴리스가 있으면 빌드가 중단되며 새 키로 조용히 바꾸지 않는다. 배포가 지속되면 동일 키를 접근이 제한된 장기 저장소/GitHub Secret으로 백업해야 한다. `.signing/`과 키 파일은 커밋하지 않는다.
