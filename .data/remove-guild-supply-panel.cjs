const fs=require('fs');
const shop='src/response/guild-shop.ts';let s=fs.readFileSync(shop,'utf8');
s=s.replace(".addButton('补给与维修','/初行公会 补给',{type:'command',autoEnter:true,style:'blue'})",'');
s=s.replace(".addButton('补给与维修', '/初行公会 补给', { type: 'command', autoEnter: true, style: 'blue' })",'');
fs.writeFileSync(shop,s);
const test='test/opening-message.test.ts';s=fs.readFileSync(test,'utf8');
s=s.replace(",补给:['/初行服务 coupon opening_trade_coupon','/初行服务 coupon opening_medical_coupon','/初行服务 repair ']",'');
fs.writeFileSync(test,s);
