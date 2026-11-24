// Inline <head> script: when the site is opened as a Telegram Mini App (the
// bot's "🌐 Сайт"/"Магазин" buttons), load Telegram's WebApp SDK and make the
// page feel native — full height, the site's dark header colour, the
// Telegram Back button wired to history, no swipe-to-close while scrolling
// the catalog. Ordinary visitors never load anything: Telegram marks a Mini
// App launch with #tgWebAppData… in the first URL, and the flag is kept in
// sessionStorage for the following in-app navigations.
const SDK_URL = "https://telegram.org/js/telegram-web-app.js";
const HEADER_COLOR = "#0f172a";
const BACKGROUND_COLOR = "#ffffff";

export const telegramWebAppBootstrap = `(function(){try{
var k="partson:tgWebApp",h=location.hash||"",inTg=/tgWebApp(Data|Platform|Version)=/.test(h);
try{if(inTg)sessionStorage.setItem(k,"1");else inTg=sessionStorage.getItem(k)==="1";}catch(e){}
if(!inTg)return;
document.documentElement.setAttribute("data-telegram-webapp","");
var s=document.createElement("script");s.src=${JSON.stringify(SDK_URL)};s.async=true;
s.onload=function(){var w=window.Telegram&&window.Telegram.WebApp;if(!w)return;
try{w.ready();w.expand();}catch(e){}
try{w.setHeaderColor(${JSON.stringify(HEADER_COLOR)});w.setBackgroundColor(${JSON.stringify(BACKGROUND_COLOR)});}catch(e){}
try{if(w.disableVerticalSwipes)w.disableVerticalSwipes();}catch(e){}
var b=w.BackButton,sync=function(){try{if(history.length>1&&location.pathname!=="/")b.show();else b.hide();}catch(e){}};
try{b.onClick(function(){history.length>1?history.back():w.close();});}catch(e){}
sync();
var p=history.pushState,r=history.replaceState;
history.pushState=function(){var x=p.apply(this,arguments);sync();return x;};
history.replaceState=function(){var x=r.apply(this,arguments);sync();return x;};
addEventListener("popstate",sync);};
document.head.appendChild(s);
}catch(e){}})();`;
