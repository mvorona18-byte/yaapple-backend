import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const required = ['DATABASE_URL','JWT_SECRET','ADMIN_EMAIL','ADMIN_PASSWORD'];
for (const key of required) if (!process.env[key]) throw new Error(`Не заполнена переменная ${key}`);

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET;
const CORS_ORIGINS = (process.env.CORS_ORIGINS || '').split(',').map(x=>x.trim()).filter(Boolean);
const pool = mysql.createPool({uri:process.env.DATABASE_URL,waitForConnections:true,connectionLimit:10,charset:'utf8mb4'});
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname,'..');

function slugify(value='') {
  const map={а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'c',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'};
  return String(value).toLowerCase().split('').map(c=>map[c]??c).join('').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || `item-${Date.now()}`;
}
function bool(v,d=false){if(v===undefined)return d;return v===true||v==='true'||v==='1'||v===1;}
function auth(req,res,next){
  const h=req.headers.authorization||''; const token=h.startsWith('Bearer ')?h.slice(7):null;
  if(!token)return res.status(401).json({error:'Требуется авторизация'});
  try{req.user=jwt.verify(token,JWT_SECRET);next();}catch{return res.status(401).json({error:'Сессия недействительна'});}
}

const upload = multer({
  storage: multer.diskStorage({
    destination:(_r,_f,cb)=>cb(null,'uploads'),
    filename:(_r,f,cb)=>cb(null,`${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(f.originalname).toLowerCase()||'.jpg'}`)
  }),
  limits:{fileSize:8*1024*1024,files:8},
  fileFilter:(_r,f,cb)=>cb(null,['image/jpeg','image/png','image/webp','image/heic'].includes(f.mimetype))
});

async function initDb(){
  await pool.query(`CREATE TABLE IF NOT EXISTS admins(id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,email VARCHAR(190) NOT NULL UNIQUE,password_hash VARCHAR(255) NOT NULL,name VARCHAR(120) NOT NULL DEFAULT 'Администратор',role ENUM('owner','manager') NOT NULL DEFAULT 'manager',is_active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query(`CREATE TABLE IF NOT EXISTS categories(id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,name VARCHAR(120) NOT NULL,slug VARCHAR(140) NOT NULL UNIQUE,sort_order INT DEFAULT 0,is_active BOOLEAN DEFAULT TRUE,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query(`CREATE TABLE IF NOT EXISTS products(id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,category_id INT UNSIGNED NULL,name VARCHAR(255) NOT NULL,slug VARCHAR(280) NOT NULL UNIQUE,description TEXT NULL,price DECIMAL(12,2) NOT NULL DEFAULT 0,old_price DECIMAL(12,2) NULL,stock INT DEFAULT 0,badge VARCHAR(80) NULL,is_featured BOOLEAN DEFAULT FALSE,is_active BOOLEAN DEFAULT TRUE,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE SET NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query(`CREATE TABLE IF NOT EXISTS product_images(id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,product_id INT UNSIGNED NOT NULL,file_name VARCHAR(255) NOT NULL,url VARCHAR(500) NOT NULL,sort_order INT DEFAULT 0,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await pool.query(`INSERT IGNORE INTO categories(name,slug,sort_order) VALUES ('Чехлы','cases',10),('Кабели','cables',20),('Блоки питания','power-adapters',30),('Зарядные станции','charging-stations',40),('Повербанки','powerbanks',50),('Другое','other',100)`);
  const [admins]=await pool.query('SELECT id FROM admins LIMIT 1');
  if(!admins.length){
    const hash=await bcrypt.hash(process.env.ADMIN_PASSWORD,12);
    await pool.query('INSERT INTO admins(email,password_hash,name,role) VALUES (?,?,?,?)',[process.env.ADMIN_EMAIL.toLowerCase(),hash,'Владелец','owner']);
  }
}

const app=express();
app.set('trust proxy',1);
app.use(helmet({contentSecurityPolicy:false,crossOriginResourcePolicy:{policy:'cross-origin'}}));
app.use(cors({origin:(origin,cb)=>!origin||!CORS_ORIGINS.length||CORS_ORIGINS.includes(origin)?cb(null,true):cb(new Error('CORS'))}));
app.use(express.json({limit:'2mb'}));
app.use('/uploads',express.static(path.join(root,'uploads')));
app.use('/admin',express.static(path.join(root,'public','admin')));

app.get('/',(_q,r)=>r.json({service:'Yaapple Backend',status:'ok',admin:'/admin',health:'/health'}));
app.get('/health',async(_q,r)=>{await pool.query('SELECT 1');r.json({status:'ok',database:'connected'});});

app.post('/api/auth/login',async(req,res)=>{
  const email=String(req.body.email||'').trim().toLowerCase();
  const [rows]=await pool.query('SELECT * FROM admins WHERE email=? LIMIT 1',[email]);
  const a=rows[0];
  if(!a||!a.is_active||!(await bcrypt.compare(String(req.body.password||''),a.password_hash)))return res.status(401).json({error:'Неверный логин или пароль'});
  const token=jwt.sign({id:a.id,email:a.email,name:a.name,role:a.role},JWT_SECRET,{expiresIn:'12h'});
  res.json({token,user:{id:a.id,email:a.email,name:a.name,role:a.role}});
});
app.get('/api/auth/me',auth,(req,res)=>res.json({user:req.user}));

app.get('/api/categories',async(_req,res)=>{const [rows]=await pool.query('SELECT * FROM categories ORDER BY sort_order,name');res.json(rows);});
app.post('/api/categories',auth,async(req,res)=>{
  const name=String(req.body.name||'').trim(); if(!name)return res.status(400).json({error:'Введите название'});
  const [result]=await pool.query('INSERT INTO categories(name,slug,sort_order,is_active) VALUES (?,?,?,?)',[name,slugify(req.body.slug||name),Number(req.body.sort_order||0),req.body.is_active!==false]);
  res.status(201).json({id:result.insertId});
});

async function productsWithImages(all=false){
  const [rows]=await pool.query(`SELECT p.*,c.name category_name,c.slug category_slug FROM products p LEFT JOIN categories c ON c.id=p.category_id ${all?'':'WHERE p.is_active=TRUE'} ORDER BY p.created_at DESC`);
  if(!rows.length)return rows;
  const ids=rows.map(x=>x.id); const [imgs]=await pool.query(`SELECT * FROM product_images WHERE product_id IN (${ids.map(()=>'?').join(',')}) ORDER BY sort_order,id`,ids);
  return rows.map(p=>({...p,images:imgs.filter(i=>i.product_id===p.id)}));
}
app.get('/api/products',async(req,res)=>res.json(await productsWithImages(req.query.all==='1')));
app.post('/api/products',auth,upload.array('images',8),async(req,res)=>{
  const name=String(req.body.name||'').trim(); const price=Number(req.body.price);
  if(!name||!Number.isFinite(price)||price<0)return res.status(400).json({error:'Проверьте название и цену'});
  const [result]=await pool.query(`INSERT INTO products(category_id,name,slug,description,price,old_price,stock,badge,is_featured,is_active) VALUES (?,?,?,?,?,?,?,?,?,?)`,[
    req.body.category_id?Number(req.body.category_id):null,name,`${slugify(name)}-${Date.now().toString().slice(-6)}`,req.body.description||null,price,req.body.old_price?Number(req.body.old_price):null,Number(req.body.stock||0),req.body.badge||null,bool(req.body.is_featured),bool(req.body.is_active,true)
  ]);
  for(const [i,f] of (req.files||[]).entries())await pool.query('INSERT INTO product_images(product_id,file_name,url,sort_order) VALUES (?,?,?,?)',[result.insertId,f.filename,`/uploads/${f.filename}`,i]);
  res.status(201).json({id:result.insertId,message:'Товар добавлен'});
});
app.put('/api/products/:id',auth,upload.array('images',8),async(req,res)=>{
  const id=Number(req.params.id),name=String(req.body.name||'').trim(),price=Number(req.body.price);
  if(!name||!Number.isFinite(price)||price<0)return res.status(400).json({error:'Проверьте название и цену'});
  await pool.query(`UPDATE products SET category_id=?,name=?,description=?,price=?,old_price=?,stock=?,badge=?,is_featured=?,is_active=? WHERE id=?`,[req.body.category_id?Number(req.body.category_id):null,name,req.body.description||null,price,req.body.old_price?Number(req.body.old_price):null,Number(req.body.stock||0),req.body.badge||null,bool(req.body.is_featured),bool(req.body.is_active,true),id]);
  const [[m]]=await pool.query('SELECT COALESCE(MAX(sort_order),-1) max_sort FROM product_images WHERE product_id=?',[id]);
  for(const [i,f] of (req.files||[]).entries())await pool.query('INSERT INTO product_images(product_id,file_name,url,sort_order) VALUES (?,?,?,?)',[id,f.filename,`/uploads/${f.filename}`,m.max_sort+i+1]);
  res.json({message:'Товар обновлён'});
});
app.delete('/api/products/:id',auth,async(req,res)=>{
  const [imgs]=await pool.query('SELECT file_name FROM product_images WHERE product_id=?',[req.params.id]);
  await pool.query('DELETE FROM products WHERE id=?',[req.params.id]);
  for(const i of imgs)await fs.unlink(path.join(root,'uploads',i.file_name)).catch(()=>{});
  res.json({message:'Товар удалён'});
});

app.use((err,_req,res,_next)=>{console.error(err);res.status(500).json({error:err.message||'Ошибка сервера'});});
await initDb();
app.listen(PORT,'0.0.0.0',()=>console.log(`Yaapple Backend запущен на ${PORT}`));
