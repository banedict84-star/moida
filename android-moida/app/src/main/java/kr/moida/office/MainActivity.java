package kr.moida.office;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import androidx.browser.customtabs.CustomTabColorSchemeParams;
import androidx.browser.customtabs.CustomTabsIntent;
import org.json.JSONObject;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public final class MainActivity extends Activity {
 private boolean foreground=false,checking=false;
 private JSONObject pendingUpdate;
 private TextView updateStatus;
 private int dp(int value){return Math.round(value*getResources().getDisplayMetrics().density);}
 @Override public void onCreate(Bundle state){
  super.onCreate(state);
  ScrollView scroll=new ScrollView(this);scroll.setFillViewport(true);scroll.setBackgroundColor(Color.rgb(244,247,251));
  LinearLayout layout=new LinearLayout(this);layout.setOrientation(LinearLayout.VERTICAL);layout.setPadding(dp(28),dp(48),dp(28),dp(32));scroll.addView(layout);
  TextView brand=text("MOIDA",14,0xFF4772B7);brand.setTypeface(null,Typeface.BOLD);layout.addView(brand);
  TextView title=text("모이다\nAI 비서실",36,0xFF142C4A);title.setTypeface(null,Typeface.BOLD);layout.addView(title);
  layout.addView(text("의원실의 업무를 한곳에서.\n웹 기능은 수정·배포 후 다시 열면 반영됩니다.",16,0xFF64758A));
  button(layout,"모이다 열기",()->openSite("dashboard"),true);
  button(layout,"오늘의 뉴스 숏츠",()->openSite("shorts"),false);
  button(layout,"일정·행사",()->openSite("schedule"),false);
  button(layout,"통화 기록",()->openSite("calls"),false);
  button(layout,"앱 업데이트 확인",()->checkUpdate(true),false);
  updateStatus=text("앱 1.0 · Android 8 이상\nChrome 또는 기본 브라우저의 로그인·다운로드 기능을 사용합니다.\n통화녹음 자동 수집은 별도의 ‘모이다 통화 연결’ 앱에서 설정하세요.",13,0xFF7E8C9E);layout.addView(updateStatus);
  setContentView(scroll);
  if(state==null){openSite("dashboard");checkUpdate(false);}
 }
 private TextView text(String value,int size,int color){TextView t=new TextView(this);t.setText(value);t.setTextSize(size);t.setTextColor(color);t.setPadding(0,0,0,dp(20));t.setLineSpacing(dp(5),1);return t;}
 private void button(LinearLayout layout,String title,Runnable action,boolean primary){
  Button b=new Button(this);b.setText(title);b.setAllCaps(false);b.setTextSize(16);b.setTextColor(primary?Color.WHITE:0xFF264A76);b.setGravity(Gravity.CENTER);b.setElevation(0);
  GradientDrawable bg=new GradientDrawable();bg.setColor(primary?0xFF244D91:Color.WHITE);bg.setCornerRadius(dp(14));if(!primary)bg.setStroke(dp(1),0xFFDDE5EF);b.setBackground(bg);
  LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,dp(56));p.bottomMargin=dp(12);layout.addView(b,p);b.setOnClickListener(v->action.run());
 }
 private void openSite(String section){
  String url=UpdatePolicy.launchUrl(section,System.currentTimeMillis());if(!UpdatePolicy.isAppUrl(url))return;
  CustomTabsIntent tab=new CustomTabsIntent.Builder().setDefaultColorSchemeParams(new CustomTabColorSchemeParams.Builder().setToolbarColor(0xFF102139).setNavigationBarColor(0xFFF4F7FB).build()).setShowTitle(true).setShareState(CustomTabsIntent.SHARE_STATE_ON).build();
  try{tab.launchUrl(this,Uri.parse(url));}catch(ActivityNotFoundException e){new AlertDialog.Builder(this).setTitle("브라우저가 필요합니다").setMessage("Chrome 또는 Samsung Internet을 설치한 뒤 모이다를 열어 주세요.").setPositiveButton("확인",null).show();}
 }
 private void checkUpdate(boolean manual){
  if(checking)return;checking=true;if(manual)updateStatus.setText("앱 업데이트를 확인하고 있습니다…");
  new Thread(()->{JSONObject result=null;String error=null;HttpURLConnection c=null;
   try{c=(HttpURLConnection)new URL(UpdatePolicy.MANIFEST+"?fresh="+System.currentTimeMillis()).openConnection();c.setConnectTimeout(8000);c.setReadTimeout(8000);c.setRequestProperty("Accept","application/json");c.setRequestProperty("Cache-Control","no-cache");if(c.getResponseCode()!=200)throw new Exception("status");
    try(InputStream in=c.getInputStream();java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream()){byte[] buffer=new byte[2048];int n;while((n=in.read(buffer))!=-1){if(out.size()+n>16384)throw new Exception("size");out.write(buffer,0,n);}result=new JSONObject(out.toString(StandardCharsets.UTF_8.name()));}
   }catch(Exception e){error="업데이트 정보를 받지 못했습니다. 잠시 후 다시 확인해 주세요.";}finally{if(c!=null)c.disconnect();}
   JSONObject info=result;String message=error;runOnUiThread(()->{checking=false;if(isFinishing()||isDestroyed())return;
    if(info!=null&&UpdatePolicy.newer(BuildConfig.VERSION_CODE,info.optInt("versionCode"),info.optString("apkUrl"))){pendingUpdate=info;if(foreground)showUpdate();}
    else if(manual)updateStatus.setText(message==null?"최신 앱입니다. 웹 기능은 별도 APK 설치 없이 반영됩니다.":message);
   });
  },"moida-update").start();
 }
 private void showUpdate(){if(pendingUpdate==null)return;JSONObject info=pendingUpdate;pendingUpdate=null;String version=info.optString("versionName","새 버전");
  new AlertDialog.Builder(this).setTitle("모이다 앱 업데이트").setMessage(version+" 버전이 있습니다. APK를 다운로드한 뒤 설치를 확인해 주세요. 웹 기능 수정은 앱을 재설치하지 않아도 반영됩니다.").setNegativeButton("나중에",null).setPositiveButton("다운로드",(d,w)->{try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(UpdatePolicy.APK)));}catch(ActivityNotFoundException e){Toast.makeText(this,"브라우저를 설치해 주세요.",Toast.LENGTH_LONG).show();}}).show();
 }
 @Override protected void onResume(){super.onResume();foreground=true;showUpdate();}
 @Override protected void onPause(){foreground=false;super.onPause();}
}
