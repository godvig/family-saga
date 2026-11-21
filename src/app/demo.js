/* Släktsagan · demo.js — The Swedish royal houses example, from Gustav Vasa to today (in memory only). */
import { mapState } from './map.js?v=61';
import { VIEWS, renderAll } from './router.js?v=61';
import { ALL, applyView, archiveData, ui } from './state.js?v=61';
import { Hist, Store } from './store.js?v=61';
import { $, clone, toast, uid } from './util.js?v=61';

/* ============ Demo ============ */
function demoData(){
  const now=new Date().toISOString();
  const pl=(id,name,lat,lon,county,country='Sverige',notes='')=>({kind:'place',id,name,lat,lon,county,country,notes});
  const places=[
    pl('pl_rydbo','Rydboholm',59.474,18.226,'Uppland','Sverige','Vasaättens sätesgård i Östra Ryd. Gustav Vasa föddes troligen här, möjligen på Lindholmen.'),
    pl('pl_sthlm','Stockholm, Tre Kronor',59.327,18.071,'Uppland'),
    pl('pl_uppsala','Uppsala',59.858,17.638,'Uppland','Sverige','Domkyrkan är kröningskyrka och gravkyrka för Gustav Vasa och Johan III.'),
    pl('pl_strangnas','Strängnäs',59.377,17.032,'Södermanland'),
    pl('pl_vadstena','Vadstena',58.448,14.890,'Östergötland'),
    pl('pl_tynnelso','Tynnelsö',59.300,17.140,'Södermanland'),
    pl('pl_stegeborg','Stegeborg',58.433,16.590,'Östergötland'),
    pl('pl_gripsholm','Gripsholm',59.257,17.219,'Södermanland'),
    pl('pl_nykoping','Nyköping',58.753,17.008,'Södermanland'),
    pl('pl_orbyhus','Örbyhus',60.230,17.700,'Uppland'),
    pl('pl_vasteras','Västerås',59.611,16.545,'Västmanland'),
    pl('pl_stromsholm','Strömsholm',59.528,16.250,'Västmanland'),
    pl('pl_gbg','Göteborg',57.708,11.974,'Västergötland'),
    pl('pl_liuksiala','Liuksiala, Kangasala',61.460,24.070,'Tavastland','Finland'),
    pl('pl_krakow','Kraków',50.062,19.937,'','Polen'),
    pl('pl_warszawa','Warszawa',52.230,21.011,'','Polen'),
    pl('pl_vilnius','Vilnius',54.687,25.280,'','Litauen'),
    pl('pl_lutzen','Lützen',51.257,12.142,'Sachsen','Tyskland'),
    pl('pl_konigsberg','Königsberg',54.710,20.510,'Preussen','Ryssland (Kaliningrad)'),
    pl('pl_heidelberg','Heidelberg',49.398,8.672,'Pfalz','Tyskland'),
    pl('pl_innsbruck','Innsbruck',47.269,11.404,'Tyrolen','Österrike'),
    pl('pl_rom','Rom',41.902,12.454,'','Italien'),
    pl('pl_nevers','Nevers',46.990,3.159,'','Frankrike'),
    pl('pl_kpnhmn','Köpenhamn',55.676,12.568,'','Danmark'),
    pl('pl_gottorp','Gottorp, Schleswig',54.512,9.541,'Schleswig','Tyskland'),
    pl('pl_karlberg','Karlbergs slott',59.343,18.025,'Uppland'),
    pl('pl_fredriksten','Fredriksten, Halden',59.118,11.394,'Østfold','Norge'),
    pl('pl_kassel','Kassel',51.312,9.479,'Hessen','Tyskland'),
    pl('pl_durlach','Durlach, Karlsruhe',48.999,8.474,'Baden','Tyskland'),
    pl('pl_drottningholm','Drottningholm',59.322,17.886,'Uppland','Sverige','Kungafamiljens bostad sedan 1981.'),
    pl('pl_berlin','Berlin',52.517,13.389,'Brandenburg','Tyskland'),
    pl('pl_svartsjo','Svartsjö slott',59.433,17.730,'Uppland'),
    pl('pl_stgallen','St. Gallen',47.424,9.376,'','Schweiz'),
    pl('pl_karlsruhe','Karlsruhe',49.009,8.404,'Baden','Tyskland'),
    pl('pl_lausanne','Lausanne',46.519,6.633,'','Schweiz'),
    pl('pl_eutin','Eutin',54.138,10.618,'Holstein','Tyskland'),
    pl('pl_pau','Pau',43.295,-0.370,'Béarn','Frankrike'),
    pl('pl_marseille','Marseille',43.296,5.370,'Provence','Frankrike'),
    pl('pl_paris','Paris',48.857,2.352,'','Frankrike'),
    pl('pl_orebro','Örebro',59.274,15.207,'Närke'),
    pl('pl_milano','Milano',45.464,9.190,'Lombardiet','Italien'),
    pl('pl_haag','Haag',52.078,4.288,'','Nederländerna'),
    pl('pl_malmo','Malmö',55.605,13.003,'Skåne'),
    pl('pl_biebrich','Biebrich, Wiesbaden',50.040,8.230,'Nassau','Tyskland'),
    pl('pl_bagshot','Bagshot Park',51.360,-0.690,'Surrey','England'),
    pl('pl_windsor','Windsor',51.484,-0.604,'Berkshire','England'),
    pl('pl_helsingborg','Helsingborg',56.046,12.694,'Skåne'),
    pl('pl_gotha','Gotha',50.948,10.701,'Thüringen','Tyskland'),
    pl('pl_coburg','Coburg',50.258,10.965,'Bayern','Tyskland'),
    pl('pl_kastrup','Kastrup',55.618,12.656,'','Danmark'),
    pl('pl_haga','Haga slott, Solna',59.364,18.034,'Uppland'),
    pl('pl_solna','Solna',59.360,18.000,'Uppland'),
  ];
  const src=(id,title,type,archive,ref,url,notes='')=>({kind:'source',id,title,type,archive,ref,url,notes,createdAt:now});
  const sources=[
    src('s_sbl','Svenskt biografiskt lexikon (SBL)','Webbplats','Riksarkivet','','https://sok.riksarkivet.se/sbl/','Biografiska artiklar om kungar och furstar.'),
    src('s_skbl','Svenskt kvinnobiografiskt lexikon (SKBL)','Webbplats','Göteborgs universitet','','https://skbl.se/','Artiklar om drottningar och prinsessor, bl.a. Margareta Leijonhufvud och Karin Månsdotter.'),
    src('s_kungl','Sveriges regenter – Kungliga slotten','Webbplats','Kungliga Hovstaterna','','https://www.kungligaslotten.se/regentlangd.html','Regentlängden: regenter, gemåler och barn.'),
    src('s_kungahuset','Monarkins historia – Kungahuset','Webbplats','Kungliga Hovstaterna','','https://www.kungahuset.se/sveriges-monarki/monarkins-historia','Kungaätterna från Vasa till Bernadotte.'),
    src('s_regentlista','Lista över Sveriges regenter','Webbplats','Wikipedia','','https://sv.wikipedia.org/wiki/Lista_%C3%B6ver_Sveriges_regenter','Regeringsår och ätter. Används som översikt, inte som primärkälla.'),
  ];
  const c=(sid,about,detail)=>({id:uid('c'),sourceId:sid,about,detail});
  const per=(id,given,surname,sex,bd,bp,dd,dp,occ,f,m,sp=[],extra={})=>Object.assign({kind:'person',id,given,surname,sex,birthDate:bd,birthPlace:bp||'',deathDate:dd,deathPlace:dp||'',occupation:occ,fatherId:f||'',motherId:m||'',spouseIds:sp,events:[],citations:[],media:[],notes:'',createdAt:now},extra);
  const ev=(type,date,placeId,desc,withId)=>({id:uid('e'),type,date,placeId:placeId||'',desc:desc||'',withId:withId||''});
  const G='p_gustav1',KS='p_kat_sachsen',ML='p_margareta',KST='p_kat_stenbock',EJ='p_erik_joh',CM='p_cecilia_m';
  const persons=[
    // Gustav Vasas föräldrar
    per(EJ,'Erik','Johansson Vasa','M','1470','','1520-11-08','pl_sthlm','Riksråd','','',[CM],{
      events:[ev('Övrigt','1520-11-08','pl_sthlm','Avrättad i Stockholms blodbad')],
      notes:'Födelseåret är ungefärligt. Ätten tog namnet Vasa först senare, efter vapnet med en vase (ett sädeskärve).',citations:[c('s_sbl','','Erik Johansson (Vasa)')]}),
    per(CM,'Cecilia','Månsdotter Eka','K','1476','','1523','pl_kpnhmn','','','',[EJ],{
      notes:'Födelseåret är ungefärligt. Fördes efter blodbadet som fånge till Köpenhamn och dog där i fångenskap, troligen i pesten.'}),
    // Gustav Vasa och hans tre hustrur
    per(G,'Gustav','Vasa','M','1496-05-12','pl_rydbo','1560-09-29','pl_sthlm','Kung av Sverige 1523–1560',EJ,CM,[KS,ML,KST],{createdAt:'1000',home:true,
      notes:'Född Gustav Eriksson. Födelseorten är osäker – Rydboholm eller Lindholmen i Uppland.\n\nExemplet följer Sveriges kungaätter från Vasa via den pfalziska, hessiska och holstein-gottorpska ätten till Bernadotte.\n\nSvenska datum före 1753 följer den julianska kalendern (”gamla stilen”) som gällde i Sverige till dess.',
      events:[ev('Övrigt','1521-08-23','pl_vadstena','Vald till riksföreståndare'),ev('Övrigt','1523-06-06','pl_strangnas','Vald till kung – Sveriges nationaldag'),ev('Vigsel','1531-09-24','pl_sthlm','',KS),ev('Vigsel','1536-10-01','','',ML),ev('Kröning','1528-01-12','pl_uppsala','Krönt i Uppsala domkyrka'),ev('Vigsel','1552-08-22','pl_vadstena','',KST),ev('Begravning','1560-12-21','pl_uppsala','Uppsala domkyrka')],
      citations:[c('s_sbl','','Gustav I'),c('s_kungl','','Gustav I')]}),
    per(KS,'Katarina','av Sachsen-Lauenburg','K','1513-09-24','','1535-09-23','pl_sthlm','Drottning','','',[G],{citations:[c('s_kungl','','Katarina av Sachsen-Lauenburg')]}),
    per(ML,'Margareta','Leijonhufvud','K','1516-01-01','','1551-08-26','pl_tynnelso','Drottning','','',[G],{notes:'Född Margareta Eriksdotter. Födelsedagen 1 januari 1516 är traditionell; SKBL anger att datum och plats är osäkra.',citations:[c('s_skbl','','Margareta, drottning'),c('s_skbl','Död','dog på Tynnelsö')]}),
    per(KST,'Katarina','Stenbock','K','1535-07-22','','1621-12-13','pl_stromsholm','Drottning','','',[G],{notes:'Systerdotter till Margareta Leijonhufvud. Inga barn med Gustav Vasa.'}),
    // Barn med Katarina av Sachsen-Lauenburg
    per('p_erik14','Erik XIV','','M','1533-12-13','pl_sthlm','1577-02-26','pl_orbyhus','Kung av Sverige 1560–1568',G,KS,['p_karin'],{
      events:[ev('Kröning','1561-06-29','pl_uppsala'),ev('Vigsel','1568-07-04','pl_sthlm','',"p_karin"),ev('Övrigt','1568','pl_sthlm','Avsatt av sina bröder Johan och Karl')],citations:[c('s_sbl','','Erik XIV')]}),
    per('p_karin','Karin','Månsdotter','K','1550-11-06','pl_sthlm','1612-09-13','pl_liuksiala','Drottning','','',['p_erik14'],{events:[ev('Kröning','1568-07-05','pl_sthlm')],notes:'Begravd i Åbo domkyrka.',citations:[c('s_skbl','','Karin Månsdotter, drottning')]}),
    per('p_sigrid','Sigrid','Eriksdotter Vasa','K','1566','','1633','','','p_erik14','p_karin'),
    per('p_gustav_e','Gustav','Eriksson Vasa','M','1568-01-28','pl_nykoping','1607','','Prins','p_erik14','p_karin',[],{notes:'Levde större delen av livet i landsflykt och dog i Ryssland.'}),
    // Barn med Margareta Leijonhufvud
    per('p_johan3','Johan III','','M','1537-12-20','pl_stegeborg','1592-11-17','pl_sthlm','Kung av Sverige 1568–1592',G,ML,['p_katjag','p_gunilla'],{
      events:[ev('Vigsel','1562-10-04','pl_vilnius','','p_katjag'),ev('Kröning','1569-07-10','pl_uppsala'),ev('Vigsel','1585-02-21','pl_vasteras','','p_gunilla')],citations:[c('s_sbl','','Johan III')]}),
    per('p_katarina_g','Katarina','Gustavsdotter Vasa','K','1539','','1610','','Grevinna av Ostfriesland',G,ML),
    per('p_cecilia','Cecilia','Gustavsdotter Vasa','K','1540','','1627','','Markgrevinna av Baden-Rodemachern',G,ML),
    per('p_magnus','Magnus','Gustavsson Vasa','M','1542','','1595','','Hertig av Östergötland',G,ML),
    per('p_karl_1544','Karl','Gustavsson Vasa','M','1544','','1544','','',G,ML,[],{notes:'Dog som spädbarn.'}),
    per('p_anna_g','Anna','Gustavsdotter Vasa','K','1545','','1610','','Pfalzgrevinna av Veldenz',G,ML),
    per('p_sten','Sten','Gustavsson Vasa','M','1546','','1547','','',G,ML,[],{notes:'Dog som spädbarn.'}),
    per('p_sofia','Sofia','Gustavsdotter Vasa','K','1547','','1611','','Hertiginna av Sachsen-Lauenburg',G,ML),
    per('p_elisabet','Elisabet','Gustavsdotter Vasa','K','1549','','1597','','Hertiginna av Mecklenburg-Gadebusch',G,ML),
    per('p_karl9','Karl IX','','M','1550-10-04','pl_sthlm','1611-10-30','pl_nykoping','Kung av Sverige 1604–1611',G,ML,['p_maria_pf','p_kristina_hg'],{
      events:[ev('Vigsel','1579-05-11','pl_heidelberg','','p_maria_pf'),ev('Vigsel','1592-08-27','pl_nykoping','','p_kristina_hg'),ev('Kröning','1607-03-15','pl_uppsala')],citations:[c('s_sbl','','Karl IX'),c('s_kungl','','Karl IX – barn')]}),
    // Johan III:s familj
    per('p_katjag','Katarina','Jagellonica','K','1526-11-01','pl_krakow','1583-09-16','pl_sthlm','Drottning','','',['p_johan3']),
    per('p_gunilla','Gunilla','Bielke','K','1568','','1597','','Drottning','','',['p_johan3']),
    per('p_sigismund','Sigismund','','M','1566-06-20','pl_gripsholm','1632-04-30','pl_warszawa','Kung av Sverige 1592–1599 och av Polen 1587–1632','p_johan3','p_katjag',['p_anna_o','p_konstantia'],{citations:[c('s_sbl','','Sigismund')]}),
    per('p_anna_j','Anna','Johansdotter Vasa','K','1568','','1625','','Prinsessa','p_johan3','p_katjag'),
    per('p_johan_og','Johan','Johansson Vasa','M','1589','','1618','','Hertig av Östergötland','p_johan3','p_gunilla'),
    per('p_anna_o','Anna','av Österrike','K','1573','','1598','pl_warszawa','Drottning av Polen','','',['p_sigismund']),
    per('p_konstantia','Konstantia','av Österrike','K','1588','','1631','pl_warszawa','Drottning av Polen','','',['p_sigismund']),
    per('p_wladyslaw','Władysław IV','','M','1595-06-09','pl_krakow','1648-05-20','','Kung av Polen 1632–1648','p_sigismund','p_anna_o'),
    per('p_jan2','Jan II Kazimierz','','M','1609-03-22','pl_krakow','1672-12-16','pl_nevers','Kung av Polen 1648–1668','p_sigismund','p_konstantia',[],{notes:'Den siste av Vasaätten på en kungatron.'}),
    // Karl IX:s familj
    per('p_maria_pf','Maria','av Pfalz','K','1561','','1589','pl_gripsholm','Hertiginna','','',['p_karl9']),
    per('p_kristina_hg','Kristina','av Holstein-Gottorp','K','1573','','1625','pl_gripsholm','Drottning','','',['p_karl9']),
    per('p_katarina_k','Katarina','Karlsdotter Vasa','K','1584-11-10','pl_nykoping','1638-12-13','pl_vasteras','Pfalzgrevinna','p_karl9','p_maria_pf',['p_johan_kasimir'],{notes:'Tog hand om den unga drottning Kristina efter Gustav II Adolfs död.'}),
    per('p_johan_kasimir','Johan Kasimir','av Pfalz-Zweibrücken','M','1589','','1652','','Pfalzgreve','','',['p_katarina_k'],{events:[ev('Vigsel','1615','','','p_katarina_k')]}),
    per('p_karl10','Karl X Gustav','','M','1622-11-08','pl_nykoping','1660-02-13','pl_gbg','Kung av Sverige 1654–1660','p_johan_kasimir','p_katarina_k',['p_hedvig_el'],{
      events:[ev('Kröning','1654-06-06','pl_uppsala','Krönt samma dag som Kristina abdikerade'),ev('Vigsel','1654-10-24','pl_sthlm','','p_hedvig_el'),ev('Övrigt','1658-02-26','','Freden i Roskilde: Skåne, Halland, Blekinge och Bohuslän blir svenska')],
      notes:'Första kungen av den pfalziska ätten (1654–1720) – Vasaätten på mödernet.',citations:[c('s_sbl','','Karl X Gustav'),c('s_kungahuset','','Pfalziska ätten')]}),
    per('p_kristina_mag','Kristina Magdalena','av Pfalz-Zweibrücken','K','1616-05-15','pl_nykoping','1662-08-14','pl_durlach','Markgrevinna av Baden-Durlach','p_johan_kasimir','p_katarina_k',['p_fredrik6_bd'],{
      notes:'Syster till Karl X Gustav. Genom henne gick tronanspråket vidare till Adolf Fredrik, hennes sonsons dotterson.'}),
    per('p_ga2','Gustav II Adolf','','M','1594-12-09','pl_sthlm','1632-11-06','pl_lutzen','Kung av Sverige 1611–1632','p_karl9','p_kristina_hg',['p_maria_el'],{
      events:[ev('Kröning','1617-10-12','pl_uppsala'),ev('Vigsel','1620-11-25','pl_sthlm','','p_maria_el'),ev('Övrigt','1632-11-06','pl_lutzen','Stupade i slaget vid Lützen')],citations:[c('s_sbl','','Gustav II Adolf')]}),
    per('p_maria_elisabet','Maria Elisabet','Karlsdotter Vasa','K','1596','','1618','','Hertiginna av Östergötland','p_karl9','p_kristina_hg'),
    per('p_karl_filip','Karl Filip','','M','1601','','1622','','Hertig av Södermanland','p_karl9','p_kristina_hg'),
    per('p_maria_el','Maria Eleonora','av Brandenburg','K','1599-11-11','pl_konigsberg','1655-03-28','pl_sthlm','Drottning','','',['p_ga2']),
    per('p_kristina','Kristina','','K','1626-12-08','pl_sthlm','1689-04-19','pl_rom','Drottning av Sverige 1632–1654','p_ga2','p_maria_el',[],{
      events:[ev('Kröning','1650-10-20','pl_sthlm'),ev('Övrigt','1654-06-06','pl_uppsala','Abdikerade på Uppsala slott'),ev('Övrigt','1655-11-03','pl_innsbruck','Konverterade offentligt till katolicismen')],
      notes:'Den sista av Vasaätten på den svenska tronen. Begravd i Peterskyrkan i Rom.',citations:[c('s_sbl','','Kristina')]}),
    // Pfalziska ätten (1654–1720)
    per('p_hedvig_el','Hedvig Eleonora','av Holstein-Gottorp','K','1636-10-23','pl_gottorp','1715-11-24','pl_sthlm','Drottning','','',['p_karl10'],{
      notes:'Förmyndarregent för sonen Karl XI och sonsonen Karl XII. Lät bygga Drottningholms slott.',citations:[c('s_skbl','','Hedvig Eleonora, drottning')]}),
    per('p_karl11','Karl XI','','M','1655-11-24','pl_sthlm','1697-04-05','pl_sthlm','Kung av Sverige 1660–1697','p_karl10','p_hedvig_el',['p_ulr_el_dk'],{
      events:[ev('Kröning','1675-09-28','pl_uppsala'),ev('Vigsel','1680-05-06','','Skottorps slott, Halland','p_ulr_el_dk'),ev('Övrigt','1680','pl_sthlm','Reduktionen och enväldet inleds')],
      notes:'Kung vid fyra års ålder. Slottet Tre Kronor brann ner i maj 1697 medan hans kista ännu stod där.',citations:[c('s_sbl','','Karl XI')]}),
    per('p_ulr_el_dk','Ulrika Eleonora','av Danmark','K','1656-09-11','pl_kpnhmn','1693-07-26','pl_karlberg','Drottning','','',['p_karl11'],{citations:[c('s_skbl','','Ulrika Eleonora d.ä., drottning')]}),
    per('p_hedvig_sofia','Hedvig Sofia','','K','1681-06-26','pl_sthlm','1708-12-22','','Hertiginna av Holstein-Gottorp','p_karl11','p_ulr_el_dk',[],{notes:'Gift med Fredrik IV av Holstein-Gottorp. Deras sonson blev tsar Peter III av Ryssland.'}),
    per('p_karl12','Karl XII','','M','1682-06-17','pl_sthlm','1718-11-30','pl_fredriksten','Kung av Sverige 1697–1718','p_karl11','p_ulr_el_dk',[],{
      events:[ev('Övrigt','1697-12-14','pl_sthlm','Smord i Storkyrkan – kröntes aldrig'),ev('Övrigt','1700-11-20','','Slaget vid Narva'),ev('Övrigt','1709-06-28','','Slaget vid Poltava')],
      notes:'Ogift och barnlös. Stupade under belägringen av Fredriksten i Norge.',citations:[c('s_sbl','','Karl XII')]}),
    per('p_ulr_el','Ulrika Eleonora','','K','1688-01-23','pl_sthlm','1741-11-24','pl_sthlm','Drottning av Sverige 1719–1720','p_karl11','p_ulr_el_dk',['p_fredrik1'],{
      events:[ev('Vigsel','1715-03-24','pl_sthlm','','p_fredrik1'),ev('Kröning','1719-03-17','pl_uppsala'),ev('Övrigt','1720-02-29','pl_sthlm','Abdikerade till förmån för sin make')],
      notes:'Sista regenten av den pfalziska ätten. Valdes till drottning mot att enväldet avskaffades – frihetstiden börjar.',citations:[c('s_skbl','','Ulrika Eleonora d.y., drottning'),c('s_kungahuset','','Pfalziska ätten')]}),
    // Hessiska huset (1720–1751)
    per('p_fredrik1','Fredrik I','av Hessen-Kassel','M','1676','pl_kassel','1751-03-25','pl_sthlm','Kung av Sverige 1720–1751','','',['p_ulr_el'],{
      notes:'Den ende kungen av det hessiska huset. Barnlös inom äktenskapet, så riksdagen fick välja en ny tronföljare.',citations:[c('s_sbl','','Fredrik I')]}),
    // Vägen från Vasa till Holstein-Gottorp
    per('p_fredrik6_bd','Fredrik VI','av Baden-Durlach','M','1617','','1677','','Markgreve av Baden-Durlach','','',['p_kristina_mag'],{events:[ev('Vigsel','1642','pl_sthlm','','p_kristina_mag')]}),
    per('p_fredrik7_bd','Fredrik VII Magnus','av Baden-Durlach','M','1647','','1709','','Markgreve av Baden-Durlach','p_fredrik6_bd','p_kristina_mag',['p_augusta_m']),
    per('p_augusta_m','Augusta Maria','av Holstein-Gottorp','K','1649','','1728','','Markgrevinna','','',['p_fredrik7_bd']),
    per('p_albertina','Albertina Fredrika','av Baden-Durlach','K','1682','','1755','','Furstinna','p_fredrik7_bd','p_augusta_m',['p_kristian_aug']),
    per('p_kristian_aug','Kristian August','av Holstein-Gottorp','M','1673','','1726','','Furstbiskop av Lübeck','','',['p_albertina']),
    // Holstein-Gottorpska ätten (1751–1818)
    per('p_adolf_fr','Adolf Fredrik','','M','1710-05-14','pl_gottorp','1771-02-12','pl_sthlm','Kung av Sverige 1751–1771','p_kristian_aug','p_albertina',['p_lovisa_ulr'],{
      events:[ev('Övrigt','1743','pl_sthlm','Vald till tronföljare efter freden i Åbo'),ev('Vigsel','1744-08-18','pl_drottningholm','','p_lovisa_ulr'),ev('Kröning','1751-11-26','pl_sthlm','Krönt i Storkyrkan')],
      notes:'Första kungen av den holstein-gottorpska ätten. Ättling till Karl IX genom Kristina Magdalena av Pfalz-Zweibrücken.',citations:[c('s_sbl','','Adolf Fredrik'),c('s_kungahuset','','Holstein-Gottorpska ätten')]}),
    per('p_lovisa_ulr','Lovisa Ulrika','av Preussen','K','1720-07-24','pl_berlin','1782-07-16','pl_svartsjo','Drottning','','',['p_adolf_fr'],{notes:'Syster till Fredrik den store. Grundade Vitterhetsakademien 1753.',citations:[c('s_skbl','','Lovisa Ulrika, drottning')]}),
    per('p_gustav3','Gustav III','','M','1746-01-24','pl_sthlm','1792-03-29','pl_sthlm','Kung av Sverige 1771–1792','p_adolf_fr','p_lovisa_ulr',['p_sofia_mag'],{
      events:[ev('Vigsel','1766-11-04','pl_sthlm','','p_sofia_mag'),ev('Kröning','1772-05-29','pl_sthlm','Krönt i Storkyrkan'),ev('Övrigt','1772-08-19','pl_sthlm','Statskupp som avslutar frihetstiden'),ev('Övrigt','1786','pl_sthlm','Grundar Svenska Akademien'),ev('Övrigt','1792-03-16','pl_sthlm','Skjuten på maskeradbalen på Operan')],
      citations:[c('s_sbl','','Gustav III')]}),
    per('p_sofia_mag','Sofia Magdalena','av Danmark','K','1746-07-03','pl_kpnhmn','1813-08-21','pl_sthlm','Drottning','','',['p_gustav3'],{citations:[c('s_skbl','','Sofia Magdalena, drottning')]}),
    per('p_ga4','Gustav IV Adolf','','M','1778-11-01','pl_sthlm','1837-02-07','pl_stgallen','Kung av Sverige 1792–1809','p_gustav3','p_sofia_mag',['p_fredrika'],{
      events:[ev('Vigsel','1797-10-31','pl_sthlm','','p_fredrika'),ev('Kröning','1800-04-03','','Krönt i Norrköping'),ev('Övrigt','1809-03-13','pl_sthlm','Avsatt efter förlusten av Finland')],
      notes:'Levde sina sista år i landsflykt under namnet överste Gustafsson.',citations:[c('s_sbl','','Gustav IV Adolf')]}),
    per('p_fredrika','Fredrika','av Baden','K','1781-03-12','pl_karlsruhe','1826-09-25','pl_lausanne','Drottning','','',['p_ga4']),
    per('p_karl13','Karl XIII','','M','1748-10-07','pl_sthlm','1818-02-05','pl_sthlm','Kung av Sverige 1809–1818, av Norge 1814–1818','p_adolf_fr','p_lovisa_ulr',['p_hedvig_el_ch'],{
      events:[ev('Vigsel','1774-07-07','pl_sthlm','','p_hedvig_el_ch'),ev('Kröning','1809-06-29','pl_sthlm','Krönt i Storkyrkan'),ev('Övrigt','1810-11-05','pl_sthlm','Adopterar Jean Baptiste Bernadotte som son','p_karl14')],
      notes:'Sista kungen av den holstein-gottorpska ätten. Barnen dog unga, så riksdagen valde en tronföljare – till slut den franske marskalken Bernadotte.',citations:[c('s_sbl','','Karl XIII'),c('s_kungahuset','','Holstein-Gottorpska ätten')]}),
    per('p_hedvig_el_ch','Hedvig Elisabet Charlotta','av Holstein-Gottorp','K','1759-03-22','pl_eutin','1818-06-20','pl_sthlm','Drottning','','',['p_karl13'],{notes:'Kusin till sin make. Känd för sina omfattande dagböcker över hovlivet.',citations:[c('s_skbl','','Hedvig Elisabet Charlotta, drottning')]}),
    // Bernadotte (sedan 1818)
    per('p_karl14','Karl XIV Johan','','M','1763-01-26','pl_pau','1844-03-08','pl_sthlm','Kung av Sverige och Norge 1818–1844','','',['p_desideria'],{
      events:[ev('Vigsel','1798-08-17','','Sceaux, utanför Paris','p_desideria'),ev('Övrigt','1810-08-21','pl_orebro','Vald till kronprins av riksdagen i Örebro'),ev('Kröning','1818-05-11','pl_sthlm','Krönt i Storkyrkan')],
      notes:'Född Jean Baptiste Bernadotte. Fransk marskalk under Napoleon, adopterad av Karl XIII 1810. Grundare av ätten Bernadotte.',citations:[c('s_sbl','','Karl XIV Johan'),c('s_kungahuset','','Ätten Bernadotte')]}),
    per('p_desideria','Desideria','','K','1777-11-08','pl_marseille','1860-12-17','pl_sthlm','Drottning','','',['p_karl14'],{notes:'Född Désirée Clary. Var en gång förlovad med Napoleon.',citations:[c('s_skbl','','Desideria, drottning')]}),
    per('p_oscar1','Oscar I','','M','1799-07-04','pl_paris','1859-07-08','pl_sthlm','Kung av Sverige och Norge 1844–1859','p_karl14','p_desideria',['p_josefina'],{
      events:[ev('Vigsel','1823-06-19','pl_sthlm','','p_josefina'),ev('Kröning','1844-09-28','pl_sthlm','Krönt i Storkyrkan')],citations:[c('s_sbl','','Oscar I')]}),
    per('p_josefina','Josefina','av Leuchtenberg','K','1807-03-14','pl_milano','1876-06-07','pl_sthlm','Drottning','','',['p_oscar1'],{notes:'Sondotter till kejsarinnan Joséphine.'}),
    per('p_karl15','Karl XV','','M','1826-05-03','pl_sthlm','1872-09-18','pl_malmo','Kung av Sverige och Norge 1859–1872','p_oscar1','p_josefina',['p_lovisa_nl'],{
      events:[ev('Vigsel','1850-06-19','pl_sthlm','','p_lovisa_nl'),ev('Kröning','1860-05-03','pl_sthlm','Krönt i Storkyrkan')],notes:'Även konstnär och poet. Saknade söner som överlevde, så brodern Oscar ärvde tronen.'}),
    per('p_lovisa_nl','Lovisa','av Nederländerna','K','1828-08-05','pl_haag','1871-03-30','pl_sthlm','Drottning','','',['p_karl15']),
    per('p_lovisa_dk','Lovisa','','K','1851-10-31','pl_sthlm','1926-03-20','pl_kpnhmn','Drottning av Danmark','p_karl15','p_lovisa_nl',[],{notes:'Gift med Fredrik VIII av Danmark.'}),
    per('p_oscar2','Oscar II','','M','1829-01-21','pl_sthlm','1907-12-08','pl_sthlm','Kung av Sverige 1872–1907, av Norge 1872–1905','p_oscar1','p_josefina',['p_sofia_nassau'],{
      events:[ev('Vigsel','1857-06-06','pl_biebrich','','p_sofia_nassau'),ev('Kröning','1873-05-12','pl_sthlm','Den senaste kröningen i Sverige'),ev('Övrigt','1905','','Unionen med Norge upplöses')],citations:[c('s_sbl','','Oscar II')]}),
    per('p_sofia_nassau','Sofia','av Nassau','K','1836-07-09','pl_biebrich','1913-12-30','pl_sthlm','Drottning','','',['p_oscar2'],{notes:'Grundade Sophiahemmet.'}),
    per('p_gustaf5','Gustaf V','','M','1858-06-16','pl_drottningholm','1950-10-29','pl_drottningholm','Kung av Sverige 1907–1950','p_oscar2','p_sofia_nassau',['p_victoria_b'],{
      events:[ev('Vigsel','1881-09-20','pl_karlsruhe','','p_victoria_b'),ev('Övrigt','1907-12-08','pl_sthlm','Tillträder utan kröning – den förste kungen som avstod')],citations:[c('s_kungahuset','','Gustaf V')]}),
    per('p_victoria_b','Victoria','av Baden','K','1862-08-07','pl_karlsruhe','1930-04-04','pl_rom','Drottning','','',['p_gustaf5'],{notes:'Ättling till Gustav IV Adolf – genom henne kom Vasablodet tillbaka till tronen.'}),
    per('p_gustaf6a','Gustaf VI Adolf','','M','1882-11-11','pl_sthlm','1973-09-15','pl_helsingborg','Kung av Sverige 1950–1973','p_gustaf5','p_victoria_b',['p_margareta_c','p_louise'],{
      events:[ev('Vigsel','1905-06-15','pl_windsor','','p_margareta_c'),ev('Vigsel','1923-11-03','','London','p_louise')],notes:'Arkeolog och samlare av kinesisk konst.',citations:[c('s_kungahuset','','Gustaf VI Adolf')]}),
    per('p_margareta_c','Margareta','av Connaught','K','1882-01-15','pl_bagshot','1920-05-01','pl_sthlm','Kronprinsessa','','',['p_gustaf6a'],{notes:'Barnbarn till drottning Victoria av Storbritannien.'}),
    per('p_louise','Louise','Mountbatten','K','1889-07-13','','1965-03-07','pl_sthlm','Drottning','','',['p_gustaf6a']),
    per('p_gustaf_adolf','Gustaf Adolf','','M','1906-04-22','pl_sthlm','1947-01-26','pl_kastrup','Prins, hertig av Västerbotten','p_gustaf6a','p_margareta_c',['p_sibylla'],{
      events:[ev('Vigsel','1932-10-20','pl_coburg','','p_sibylla')],notes:'Omkom i en flygolycka på Kastrup innan han hann bli kung.'}),
    per('p_sibylla','Sibylla','av Sachsen-Coburg-Gotha','K','1908-01-18','pl_gotha','1972-11-28','pl_sthlm','Prinsessa','','',['p_gustaf_adolf']),
    per('p_carl16','Carl XVI Gustaf','','M','1946-04-30','pl_haga','','','Kung av Sverige sedan 1973','p_gustaf_adolf','p_sibylla',['p_silvia'],{living:true,
      events:[ev('Övrigt','1973-09-15','pl_sthlm','Tillträder som kung'),ev('Vigsel','1976-06-19','pl_sthlm','Storkyrkan','p_silvia')],
      notes:'Sveriges statschef. Tronföljden ändrades 1980 så att det äldsta barnet ärver oavsett kön.',citations:[c('s_kungahuset','','Kung Carl XVI Gustaf')]}),
    per('p_silvia','Silvia','Sommerlath','K','1943-12-23','pl_heidelberg','','','Drottning','','',['p_carl16'],{living:true,citations:[c('s_kungahuset','','Drottning Silvia')]}),
    per('p_victoria_kp','Victoria','','K','1977-07-14','pl_solna','','','Kronprinsessa','p_carl16','p_silvia',[],{living:true,notes:'Tronföljare. Blir den första regerande drottningen sedan Ulrika Eleonora.',citations:[c('s_kungahuset','','Kronprinsessan Victoria')]}),
  ];
  return {places,sources,persons};
}
let _demoIds=null;
const demoIds=()=>_demoIds||(_demoIds=(()=>{const d=demoData(); return new Set([...d.places,...d.sources,...d.persons].map(o=>o.id));})());
const demoActive=()=>!!Store.demo;
function updateDemoBar(){const b=$('#demoBar'); if(b) b.classList.toggle('on',Store.loaded&&demoActive()); document.body.classList.toggle('demo',demoActive());}
/* The example family lives only in memory: it is never saved, so it can't
   end up in someone's own archive or in a shared tree. */
function loadDemo(){
  /* stay on the page you're on; from the start or import page, go to the tree */
  const stay=!['start','import'].includes(ui.view)&&VIEWS[ui.view];
  if(Store.demo){ if(!stay&&location.hash!=='#trad') location.hash='trad'; return; }
  const {places,sources,persons}=demoData();
  Store.demo={saved:archiveData(),focus:ui.focus,viewId:ui.viewId};
  const m=a=>Object.fromEntries(a.map(o=>[o.id,clone(o)]));
  ALL.persons=m(persons); ALL.places=m(places); ALL.sources=m(sources); ALL.views={}; ALL.comments={}; ALL.logs={}; Hist.clear();
  ui.viewId=null; ui.focus='p_gustav1'; ui.ancGen=2; ui.descGen=3; ui.treeKey=null; ui.sel=null;
  applyView();
  toast('Det här är ett exempel. Inget sparas – dina egna uppgifter ligger kvar orörda.',5000);
  ui.fanKey=null; mapState.drawn=false;
  if(stay||location.hash==='#trad') renderAll(true); else location.hash='trad';
}
function exitDemo(quiet){
  const d=Store.demo; if(!d) return;
  Store.demo=null; Object.assign(ALL,d.saved); Hist.clear();
  ui.viewId=d.viewId&&ALL.views[d.viewId]?d.viewId:null; ui.focus=d.focus; ui.sel=null; ui.treeKey=null;
  applyView();
  if(quiet) return;
  toast('Exemplet är stängt');
  if(location.hash!=='#start') location.hash='start'; else renderAll(true);
}
/* Older versions saved the example into the archive. Remove it quietly. */
function purgeLegacyDemo(){
  if(!Store.canEdit||!Store.isAdmin) return;
  const ids=demoIds(); if(!Object.keys(ALL.persons).some(id=>ids.has(id))) return;
  for(const p of Object.values(ALL.persons)){ if(ids.has(p.id)) continue; const q=clone(p); let ch=false;
    for(const k of ['fatherId','motherId']) if(ids.has(q[k])){q[k]='';ch=true;}
    const sp=(q.spouseIds||[]).filter(x=>!ids.has(x)); if(sp.length!==(q.spouseIds||[]).length){q.spouseIds=sp;ch=true;}
    if(ch) Store.put(q,{silent:true,nohist:true}); }
  for(const v of Object.values(ALL.views)){const refs=[...(v.hide||[]),...(v.hideUp||[]),...(v.hideDown||[])]; if(refs.length&&refs.every(id=>ids.has(id))) Store.del('view',v.id,{silent:true,nohist:true});}
  for(const [kind,col] of [['person','persons'],['place','places'],['source','sources']]) for(const id of Object.keys(ALL[col])) if(ids.has(id)) Store.del(kind,id,{silent:true,nohist:true});
  if(ui.focus&&ids.has(ui.focus)) ui.focus=null;
}

export { demoData, _demoIds, demoIds, demoActive, updateDemoBar, loadDemo, exitDemo, purgeLegacyDemo };
