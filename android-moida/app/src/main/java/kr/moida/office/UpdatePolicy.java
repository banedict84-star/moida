package kr.moida.office;

import java.net.URI;

public final class UpdatePolicy {
 public static final String SITE="https://banedict84-star.github.io/moida/platform.html";
 public static final String APK="https://github.com/banedict84-star/moida/releases/download/moida-app-latest/moida.apk";
 public static final String MANIFEST="https://github.com/banedict84-star/moida/releases/download/moida-app-latest/moida-app-version.json";
 private UpdatePolicy() {}
 public static boolean isAppUrl(String value) {
  try { URI u=URI.create(value); return "https".equals(u.getScheme()) && "banedict84-star.github.io".equals(u.getHost()) && u.getUserInfo()==null && u.getPort()==-1 && u.getPath()!=null && u.getPath().startsWith("/moida/") && !u.getPath().contains("..") && !u.getRawPath().contains("%"); } catch(Exception e) { return false; }
 }
 public static String launchUrl(String section,long now) {
  String hash=switch(section) { case "shorts" -> "shorts"; case "calls" -> "calls"; case "schedule" -> "schedule"; default -> "dashboard"; };
  return SITE+"?app=android&fresh="+Math.max(0,now)+"#"+hash;
 }
 public static boolean newer(int installed,int available,String apk) { return available>installed && APK.equals(apk); }
}
