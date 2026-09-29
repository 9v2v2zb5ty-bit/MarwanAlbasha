const express=require("express");
const path=require("path");
const fs=require("fs");
const bcrypt=require("bcryptjs");
const jwt=require("jsonwebtoken");
const Database=require("better-sqlite3");

const app=express();
const PORT=process.env.PORT||3000;
const JWT_SECRET=process.env.JWT_SECRET||"dev-only-change-this-secret";
const ADMIN_NAME=process.env.ADMIN_NAME||"مدير Marwan Albasha";
const ADMIN_PHONE=process.env.ADMIN_PHONE||"07700000000";
const ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||"CHANGE_ADMIN_PASSWORD";
const dbDir=path.join(__dirname,"data");
fs.mkdirSync(dbDir,{recursive:true});
const db=new Database(path.join(dbDir,"marwan.sqlite"));
db.pragma("foreign_keys=ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 phone TEXT UNIQUE NOT NULL,
 password_hash TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'student',
 grade TEXT DEFAULT 'السادس العلمي',
 active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS activation_codes(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 code TEXT UNIQUE NOT NULL,
 package TEXT NOT NULL DEFAULT 'full',
 used_by INTEGER,
 active INTEGER NOT NULL DEFAULT 1,
 expires_at TEXT,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(used_by) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS courses(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 title TEXT NOT NULL,
 icon TEXT NOT NULL DEFAULT 'book',
 description TEXT DEFAULT '',
 progress INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS enrollments(
 user_id INTEGER NOT NULL,
 course_id INTEGER NOT NULL,
 PRIMARY KEY(user_id,course_id),
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS lectures(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 course_id INTEGER NOT NULL,
 title TEXT NOT NULL,
 duration TEXT DEFAULT '',
 video_url TEXT DEFAULT '',
 completed INTEGER DEFAULT 0,
 FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS exams(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 course_id INTEGER NOT NULL,
 title TEXT NOT NULL,
 questions INTEGER DEFAULT 10,
 duration INTEGER DEFAULT 20,
 FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS results(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL,
 exam_id INTEGER NOT NULL,
 score INTEGER NOT NULL,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY(exam_id) REFERENCES exams(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS notifications(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER,
 title TEXT NOT NULL,
 body TEXT NOT NULL,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
`);

const count=db.prepare("SELECT COUNT(*) c FROM courses").get().c;
if(!count){
 const ins=db.prepare("INSERT INTO courses(title,icon,description,progress) VALUES(?,?,?,?)");
 [
  ["الرياضيات","math","الفصل الثالث وتطبيقاته",72],
  ["الفيزياء","physics","الحركة والقوانين الأساسية",84],
  ["الكيمياء","chemistry","الاتزان والتفاعلات",91],
  ["الأحياء","biology","الوراثة والأحياء الخلوية",66]
 ].forEach(x=>ins.run(...x));
 const ids=db.prepare("SELECT id,title FROM courses").all();
 const lec=db.prepare("INSERT INTO lectures(course_id,title,duration,video_url) VALUES(?,?,?,?)");
 const ex=db.prepare("INSERT INTO exams(course_id,title,questions,duration) VALUES(?,?,?,?)");
 for(const c of ids){
   lec.run(c.id,`المحاضرة الأولى - ${c.title}`,"45 دقيقة","");
   lec.run(c.id,`المحاضرة الثانية - ${c.title}`,"52 دقيقة","");
   ex.run(c.id,`اختبار ${c.title} الأسبوعي`,20,30);
 }
}
function ensureAdmin(){
 const a=db.prepare("SELECT id FROM users WHERE phone=?").get(ADMIN_PHONE);
 if(!a){
   const hash=bcrypt.hashSync(ADMIN_PASSWORD,12);
   db.prepare("INSERT INTO users(name,phone,password_hash,role) VALUES(?,?,?,?)")
     .run(ADMIN_NAME,ADMIN_PHONE,hash,"admin");
 }
}
ensureAdmin();

function auth(req,res,next){
 const h=req.headers.authorization||"";
 const token=h.startsWith("Bearer ")?h.slice(7):null;
 if(!token)return res.status(401).json({error:"غير مصرح"});
 try{req.user=jwt.verify(token,JWT_SECRET);next()}catch{res.status(401).json({error:"انتهت الجلسة"})}
}
function admin(req,res,next){if(req.user.role!=="admin")return res.status(403).json({error:"صلاحيات المدير مطلوبة"});next()}
function makeCode(){
 let s="";
 const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
 for(let i=0;i<12;i++){if(i&&i%4===0)s+="-";s+=chars[Math.floor(Math.random()*chars.length)]}
 return "MBA-"+s;
}

app.use(express.json({limit:"1mb"}));
app.use(express.static(path.join(__dirname,"public")));

app.post("/api/auth/register",async(req,res)=>{
 const {name,phone,password,activationCode}=req.body||{};
 if(!name||!phone||!password||!activationCode)return res.status(400).json({error:"كل الحقول مطلوبة"});
 const code=db.prepare("SELECT * FROM activation_codes WHERE code=? AND active=1 AND used_by IS NULL").get(activationCode.trim().toUpperCase());
 if(!code)return res.status(400).json({error:"كود التفعيل غير صالح أو مستخدم"});
 if(code.expires_at && new Date(code.expires_at)<new Date())return res.status(400).json({error:"كود التفعيل منتهي"});
 if(db.prepare("SELECT id FROM users WHERE phone=?").get(phone))return res.status(400).json({error:"رقم الهاتف مسجل مسبقاً"});
 const hash=await bcrypt.hash(password,12);
 const tx=db.transaction(()=>{
   const u=db.prepare("INSERT INTO users(name,phone,password_hash,role) VALUES(?,?,?,'student')").run(name,phone,hash);
   db.prepare("UPDATE activation_codes SET used_by=? WHERE id=?").run(u.lastInsertRowid,code.id);
   db.prepare("INSERT INTO notifications(user_id,title,body) VALUES(?,?,?)").run(u.lastInsertRowid,"مرحباً بك في Marwan Albasha","تم تفعيل حسابك بنجاح.");
   return u.lastInsertRowid;
 });
 const id=tx();
 const user=db.prepare("SELECT id,name,phone,role,grade FROM users WHERE id=?").get(id);
 const token=jwt.sign(user,JWT_SECRET,{expiresIn:"7d"});
 res.json({token,user});
});
app.post("/api/auth/login",async(req,res)=>{
 const {phone,password}=req.body||{};
 const u=db.prepare("SELECT * FROM users WHERE phone=? AND active=1").get(phone);
 if(!u || !(await bcrypt.compare(password,u.password_hash)))return res.status(401).json({error:"رقم الهاتف أو كلمة المرور غير صحيحة"});
 const user={id:u.id,name:u.name,phone:u.phone,role:u.role,grade:u.grade};
 res.json({token:jwt.sign(user,JWT_SECRET,{expiresIn:"7d"}),user});
});

app.get("/api/me",auth,(req,res)=>res.json(db.prepare("SELECT id,name,phone,role,grade,active,created_at FROM users WHERE id=?").get(req.user.id)));
app.get("/api/dashboard",auth,(req,res)=>{
 const courses=db.prepare(`SELECT c.*,CASE WHEN e.user_id IS NULL THEN 0 ELSE c.progress END AS progress
 FROM courses c LEFT JOIN enrollments e ON e.course_id=c.id AND e.user_id=?`).all(req.user.id);
 const lectures=db.prepare(`SELECT l.*,c.title course FROM lectures l JOIN courses c ON c.id=l.course_id ORDER BY l.id DESC LIMIT 10`).all();
 const exams=db.prepare(`SELECT e.*,c.title course FROM exams e JOIN courses c ON c.id=e.course_id ORDER BY e.id DESC LIMIT 10`).all();
 const results=db.prepare(`SELECT r.score,e.title FROM results r JOIN exams e ON e.id=r.exam_id WHERE r.user_id=? ORDER BY r.id DESC LIMIT 10`).all(req.user.id);
 const notifications=db.prepare("SELECT * FROM notifications WHERE user_id=? OR user_id IS NULL ORDER BY id DESC LIMIT 10").all(req.user.id);
 res.json({courses,lectures,exams,results,notifications});
});
app.post("/api/enroll/:courseId",auth,(req,res)=>{
 const c=db.prepare("SELECT id FROM courses WHERE id=?").get(req.params.courseId);
 if(!c)return res.status(404).json({error:"المادة غير موجودة"});
 db.prepare("INSERT OR IGNORE INTO enrollments(user_id,course_id) VALUES(?,?)").run(req.user.id,c.id);
 res.json({ok:true});
});

app.get("/api/admin/stats",auth,admin,(req,res)=>{
 res.json({
  students:db.prepare("SELECT COUNT(*) c FROM users WHERE role='student'").get().c,
  codes:db.prepare("SELECT COUNT(*) c FROM activation_codes").get().c,
  unusedCodes:db.prepare("SELECT COUNT(*) c FROM activation_codes WHERE used_by IS NULL AND active=1").get().c,
  courses:db.prepare("SELECT COUNT(*) c FROM courses").get().c
 });
});
app.get("/api/admin/students",auth,admin,(req,res)=>{
 res.json(db.prepare(`SELECT id,name,phone,grade,active,created_at FROM users WHERE role='student' ORDER BY id DESC`).all());
});
app.post("/api/admin/codes",auth,admin,(req,res)=>{
 const {count=1,packageName="full",expiresAt=null}=req.body||{};
 const n=Math.min(Math.max(Number(count)||1,1),1000);
 const out=[];
 const ins=db.prepare("INSERT INTO activation_codes(code,package,expires_at) VALUES(?,?,?)");
 const tx=db.transaction(()=>{for(let i=0;i<n;i++){let code;do{code=makeCode()}while(db.prepare("SELECT id FROM activation_codes WHERE code=?").get(code));ins.run(code,packageName,expiresAt);out.push(code)}});
 tx();res.json({codes:out});
});
app.get("/api/admin/codes",auth,admin,(req,res)=>{
 res.json(db.prepare(`SELECT a.id,a.code,a.package,a.active,a.expires_at,a.created_at,u.name used_by
 FROM activation_codes a LEFT JOIN users u ON u.id=a.used_by ORDER BY a.id DESC LIMIT 500`).all());
});
app.patch("/api/admin/codes/:id",auth,admin,(req,res)=>{
 const active=req.body.active?1:0;
 db.prepare("UPDATE activation_codes SET active=? WHERE id=?").run(active,req.params.id);
 res.json({ok:true});
});
app.post("/api/admin/students/:id/active",auth,admin,(req,res)=>{
 db.prepare("UPDATE users SET active=? WHERE id=? AND role='student'").run(req.body.active?1:0,req.params.id);
 res.json({ok:true});
});
app.post("/api/admin/courses",auth,admin,(req,res)=>{
 const {title,icon="book",description=""}=req.body||{};
 if(!title)return res.status(400).json({error:"اسم المادة مطلوب"});
 const x=db.prepare("INSERT INTO courses(title,icon,description) VALUES(?,?,?)").run(title,icon,description);
 res.json({id:x.lastInsertRowid});
});
app.post("/api/admin/lectures",auth,admin,(req,res)=>{
 const {courseId,title,duration="",videoUrl=""}=req.body||{};
 if(!courseId||!title)return res.status(400).json({error:"بيانات المحاضرة ناقصة"});
 const x=db.prepare("INSERT INTO lectures(course_id,title,duration,video_url) VALUES(?,?,?,?)").run(courseId,title,duration,videoUrl);
 res.json({id:x.lastInsertRowid});
});
app.post("/api/admin/exams",auth,admin,(req,res)=>{
 const {courseId,title,questions=10,duration=20}=req.body||{};
 const x=db.prepare("INSERT INTO exams(course_id,title,questions,duration) VALUES(?,?,?,?)").run(courseId,title,questions,duration);
 res.json({id:x.lastInsertRowid});
});
app.post("/api/results",auth,(req,res)=>{
 const {examId,score}=req.body||{};
 if(!examId || score===undefined)return res.status(400).json({error:"بيانات النتيجة ناقصة"});
 const e=db.prepare("SELECT id FROM exams WHERE id=?").get(examId);
 if(!e)return res.status(404).json({error:"الاختبار غير موجود"});
 db.prepare("INSERT INTO results(user_id,exam_id,score) VALUES(?,?,?)").run(req.user.id,examId,Math.max(0,Math.min(100,Number(score))));
 res.json({ok:true});
});
app.get("/api/admin/results",auth,admin,(req,res)=>{
 res.json(db.prepare(`SELECT r.id,u.name,e.title,r.score,r.created_at
 FROM results r JOIN users u ON u.id=r.user_id JOIN exams e ON e.id=r.exam_id
 ORDER BY r.id DESC LIMIT 500`).all());
});

app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log(`Marwan Albasha running on http://localhost:${PORT}`));
