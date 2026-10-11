package kr.moida.office;
import org.junit.Test;
import static org.junit.Assert.*;
public class UpdatePolicyTest {
 @Test public void launchUsesFreshTrustedSiteAndKnownSections(){String a=UpdatePolicy.launchUrl("shorts",123);assertTrue(UpdatePolicy.isAppUrl(a));assertTrue(a.contains("fresh=123#shorts"));assertTrue(UpdatePolicy.launchUrl("https://evil.test",-1).endsWith("fresh=0#dashboard"));}
 @Test public void rejectsOtherOriginsAndEncodedPaths(){for(String s:new String[]{"http://banedict84-star.github.io/moida/","https://banedict84-star.github.io.evil.test/moida/","https://evil.test/moida/","https://user@banedict84-star.github.io/moida/","https://banedict84-star.github.io/moida/../other","https://banedict84-star.github.io/moida/%2e%2e/other","https://banedict84-star.github.io:444/moida/"})assertFalse(s,UpdatePolicy.isAppUrl(s));}
 @Test public void updatesRequireNewerVersionAndPinnedApk(){assertTrue(UpdatePolicy.newer(1,2,UpdatePolicy.APK));assertFalse(UpdatePolicy.newer(1,1,UpdatePolicy.APK));assertFalse(UpdatePolicy.newer(2,1,UpdatePolicy.APK));assertFalse(UpdatePolicy.newer(1,2,"https://evil.test/app.apk"));}
}
