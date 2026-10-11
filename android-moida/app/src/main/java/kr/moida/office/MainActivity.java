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
import android.widget.ImageView;
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
  LinearLayout layout=new LinearLayout(this);layout.setOrientation(LinearLayout.VERTICAL);layout.setPadding(dp(22),dp(28),dp(22),dp(24));scroll.addView(layout);
  LinearLayout header=new LinearLayout(this);header.setGravity(Gravity.CENTER_VERTICAL);
  ImageView logo=new ImageView(this);logo.setImageResource(kr.moida.office.R.drawable.ic_moida);logo.setContentDescription("모이다 로고");header.addView(logo,new LinearLayout.LayoutParams(dp(48),dp(48)));
  TextView brand=text("모이다\nAI 비서실",18,0xFF142C4A);brand.setTypeface(null,Typeface.BOLD);brand.setPadding(dp(12),0,0,0);header.addView(brand);layout.addView(header);
  TextView greeting=text("오늘도, 모이다와 함께.",24,0xFF142C4A);greeting.setTypeface(null,Typeface.BOLD);greeting.setPadding(0,dp(30),0,dp(8));layout.addView(greeting);
  layout.addView(text("일정과 소통, 콘텐츠를 한곳에서.",14,0xFF64758A));
  LinearLayout hero=new LinearLayout(this);hero.setOrientation(LinearLayout.VERTICAL);hero.setPadding(dp(22),dp(22),dp(22),dp(10));hero.setBackground(surface(0xFF102C4B,22));
  hero.addView(text("AI 비서실",13,0xFF88DFCF));TextView title=text("오늘의 업무를\n이어가세요.",27,Color.WHITE);title.setTypeface(null,Typeface.BOLD);hero.addView(title);
  button(hero,"비서실 들어가기  →",()->openSite("dashboard"),false);layout.addView(hero);
  TextView quick=text("빠른 시작",14,0xFF142C4A);quick.setTypeface(null,Typeface.BOLD);quick.setPadding(0,dp(24),0,dp(12));layout.addView(quick);
  LinearLayout row=new LinearLayout(this);row.setOrientation(LinearLayout.HORIZONTAL);
  tile(row,"뉴스 숏츠\n기사로 영상 만들기",()->openSite("shorts"));tile(row,"일정·행사\n다가오는 일정 보기",()->openSite("schedule"));layout.addView(row);
  button(layout,"통화 기록  →",()->openSite("calls"),false);
  Button update=new Button(this);update.setText("앱 업데이트 확인");update.setAllCaps(false);update.setTextSize(13);update.setTextColor(0xFF64758A);update.setBackgroundColor(Color.TRANSPARENT);update.setOnClickListener(v->checkUpdate(true));layout.addView(update);
  updateStatus=text("MOIDA · v"+BuildConfig.VERSION_NAME+"\n웹 기능은 다시 열면 반영됩니다.",12,0xFF7E8C9E);layout.addView(updateStatus);
  setContentView(scroll);
  if(state==null){openSite("dashboard");checkUpdate(false);}
 }
 private GradientDrawable surface(int color,int radius){GradientDrawable bg=new GradientDrawable();bg.setColor(color);bg.setCornerRadius(dp(radius));return bg;}
 private void tile(LinearLayout row,String label,Runnable action){Button b=new Button(this);b.setText(label);b.setAllCaps(false);b.setTextSize(14);b.setTextColor(0xFF264A76);b.setGravity(Gravity.START|Gravity.CENTER_VERTICAL);b.setPadding(dp(16),dp(12),dp(10),dp(12));b.setElevation(0);b.setBackground(surface(Color.WHITE,18));LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,dp(106),1);p.bottomMargin=dp(12);if(row.getChildCount()==0)p.rightMargin=dp(10);row.addView(b,p);b.setOnClickListener(v->action.run());}
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
