#!/usr/bin/env python3
"""Read-only representative public SEO crawl, using Python's standard library."""
import argparse, concurrent.futures, datetime, html, json, re, time
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError
from urllib.parse import urljoin, urlparse

class PageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title=[]; self.h1=[]; self.headings=[]; self.meta={}; self.canonicals=[]; self.links=[]; self.scripts=[]; self.lang=None
        self.current=None; self.buf=[]; self.script=False; self.scriptbuf=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=='html': self.lang=a.get('lang')
        if tag=='meta':
            key=a.get('name',a.get('property','')).lower()
            self.meta.setdefault(key,[]).append(a.get('content',''))
        if tag=='link' and 'canonical' in a.get('rel','').split(): self.canonicals.append(a.get('href',''))
        if tag=='a' and a.get('href'): self.links.append(a['href'])
        if tag in ['title','h1','h2','h3']:
            self.current=tag; self.buf=[]
        if tag=='script' and a.get('type')=='application/ld+json': self.script=True;self.scriptbuf=[]
    def handle_data(self,data):
        if self.current: self.buf.append(data)
        if self.script: self.scriptbuf.append(data)
    def handle_endtag(self,tag):
        if tag==self.current:
            text=re.sub(r'\s+',' ',''.join(self.buf)).strip()
            if tag=='title': self.title.append(text)
            elif tag=='h1': self.h1.append(text)
            else:self.headings.append({'level':tag,'text':text})
            self.current=None;self.buf=[]
        if tag=='script' and self.script:
            self.scripts.append(''.join(self.scriptbuf));self.script=False;self.scriptbuf=[]

class Redirects(HTTPRedirectHandler):
    def __init__(self):super().__init__();self.chain=[]
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        self.chain.append({'status':code,'from':req.full_url,'to':newurl})
        return super().redirect_request(req,fp,code,msg,headers,newurl)

def read_url(url):
    tracker=Redirects();opener=build_opener(tracker);start=time.monotonic()
    try:
        response=opener.open(Request(url,headers={'User-Agent':'PartsON-SEO-Audit/1.0','Accept':'text/html,application/xml,text/plain;q=0.9'}),timeout=25)
    except HTTPError as error:response=error
    except Exception as error:return {'url':url,'error':str(error)}
    raw=response.read(8_000_000).decode('utf-8','replace')
    return {'url':url,'finalUrl':response.url,'status':response.status,'redirects':tracker.chain,'headers':dict(response.headers),'elapsedMs':round((time.monotonic()-start)*1000),'raw':raw}

def json_nodes(value):
    if isinstance(value,list):
        for item in value:yield from json_nodes(item)
    elif isinstance(value,dict):
        if '@type' in value:yield value
        for item in value.values():
            if isinstance(item,(dict,list)):yield from json_nodes(item)

def audit(url,label):
    result=read_url(url);result['label']=label
    if 'raw' not in result:return result
    parser=PageParser();parser.feed(result.pop('raw'))
    meta=parser.meta;result.update(title=parser.title,description=meta.get('description',[]),canonical=parser.canonicals,h1=parser.h1,headings=parser.headings,lang=parser.lang,robots=meta.get('robots',[]),googlebot=meta.get('googlebot',[]),openGraph={k:v for k,v in meta.items() if k.startswith('og:')},links=parser.links)
    result['jsonLdErrors']=[];result['structuredData']=[]
    for source in parser.scripts:
        try:result['structuredData'].extend(json_nodes(json.loads(source)))
        except Exception as error:result['jsonLdErrors'].append(str(error))
    result['schemaTypes']=sorted(set(str(t) for n in result['structuredData'] for t in (n['@type'] if isinstance(n['@type'],list) else [n['@type']])))
    tags=' '.join(result['robots']+result['googlebot']+[result['headers'].get('X-Robots-Tag','')]).lower()
    result['noindex']=bool(re.search(r'\b(noindex|none)\b',tags));result['titleLength']=len(result['title'][0]) if result['title'] else 0;result['descriptionLength']=len(result['description'][0]) if result['description'] else 0
    result['issues']=[]
    if result['status']==200 and not result['noindex']:
        if len(result['title'])!=1:result['issues'].append('Кількість title: '+str(len(result['title'])))
        if len(result['description'])!=1:result['issues'].append('Кількість meta description: '+str(len(result['description'])))
        if len(result['canonical'])!=1:result['issues'].append('Кількість canonical: '+str(len(result['canonical'])))
        if not result['h1']:result['issues'].append('H1 не знайдено в HTML')
        if len(result['h1'])>1:result['issues'].append('Кілька H1: перевірити ієрархію')
        if result['jsonLdErrors']:result['issues'].append('Помилка JSON-LD')
        if result['titleLength']>70:result['issues'].append('Довгий title: перевірити візуальне обрізання')
        if result['descriptionLength']>180:result['issues'].append('Довгий опис: перевірити сніпет')
        if parser.lang not in ['uk','uk-UA']:result['issues'].append('Перевірити мову HTML: '+str(parser.lang))
    print(json.dumps({'path':urlparse(url).path,'status':result['status'],'label':label,'title':result['title'],'noindex':result['noindex'],'issues':result['issues']},ensure_ascii=False),flush=True)
    return result

def main():
    cli=argparse.ArgumentParser();cli.add_argument('--base',default='https://partson.shop');cli.add_argument('--out',default='docs/seo-audit-2026-10-26.json');args=cli.parse_args();base=args.base.rstrip('/')
    seeds=[('/', 'Головна'),('/katalog','Каталог'),('/auto','Марки авто'),('/groups','Категорії'),('/manufacturers','Виробники'),('/blog','Блог'),('/partnership','Партнерство')]
    seeds += [('/inform/'+key,label) for key,label in [('delivery','Доставка'),('payment','Оплата'),('about','Про магазин'),('location','Адреса магазину'),('warranty','Гарантія'),('returns','Повернення'),('diagnostics','Діагностика'),('privacy','Конфіденційність')]]
    seeds += [('/editorial-policy','Редакційна політика'),('/authors/partson','Автор матеріалів'),('/privacy-policy','Політика конфіденційності'),('/about','Стара адреса: про нас'),('/contact','Стара адреса: контакти'),('/inform','Інформаційний розділ'),('/success','Службова: завершення замовлення'),('/reset-password','Службова: пароль')]
    pages=[]
    def batch(pairs):
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            pages.extend(pool.map(lambda item:audit(urljoin(base,item[0]),item[1]),pairs))
    batch(seeds)
    def find(pagepath,prefix,depth,preferred=None):
        page=next((p for p in pages if urlparse(p['url']).path==pagepath),{})
        links=[]
        for href in page.get('links',[]):
            u=urlparse(urljoin(base,href))
            if u.netloc!=urlparse(base).netloc or u.query:continue
            if u.path.startswith(prefix) and len(u.path.strip('/').split('/'))==depth:links.append(u.path)
        links=list(dict.fromkeys(links))
        return next((p for p in links if preferred and preferred in p),links[0] if links else None)
    brand=find('/auto','/auto/',2,'volkswagen');group=find('/groups','/groups/',2,'to');producer=find('/manufacturers','/manufacturers/',2,'bosch');post=find('/blog','/blog/',2);product=find('/katalog','/product/',2)
    selected=[(brand,'Марка авто'),(group,'Група запчастин'),(producer,'Бренд запчастин'),(post,'Стаття блогу'),(product,'Товар')]
    batch([(p,l) for p,l in selected if p])
    model=find(brand,'/auto/',3,'golf') if brand else None
    sub=find(group,'/groups/',3) if group else None
    batch([(p,l) for p,l in [(model,'Модель авто'),(sub,'Підгрупа запчастин'),('/katalog?search=OC90','Службова: пошук'),('/katalog?page=2','Каталог: сторінка 2'),('/seo-audit-not-found-20261026','Перевірка 404')] if p])
    feeds=[]
    for path in ['/robots.txt','/sitemap.xml','/information-sitemap.xml','/other-pages-sitemap.xml','/blog-sitemap.xml']:
        r=read_url(base+path);raw=r.pop('raw','');r['content']=raw if path=='/robots.txt' else None;r['locations']=re.findall(r'<loc>(.*?)</loc>',raw);r['lastmod']=list(dict.fromkeys(re.findall(r'<lastmod>(.*?)</lastmod>',raw)));r['urlCount']=len(r['locations']);feeds.append(r)
    out={'checkedAt':'2026-10-26','baseUrl':base,'scope':'Representative public templates and all main information pages; not a crawl of every product/model URL. Raw HTTP HTML, no Search Console access or Google index confirmation.','pages':pages,'feeds':feeds}
    Path(args.out).parent.mkdir(parents=True,exist_ok=True);Path(args.out).write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n');print('SAVED',args.out, 'pages',len(pages),flush=True)
if __name__=='__main__':main()
