# CoconutDSS — พยากรณ์ความต้องการมะพร้าวน้ำหอมด้วย Machine Learning

เว็บแอปพยากรณ์ demand มะพร้าวน้ำหอม: FastAPI + scikit-learn/XGBoost/LightGBM (backend) และ React + Vite (frontend)

## โครงสร้างโปรเจกต์

- `backend/` — FastAPI API, ML pipeline, auth (JWT), SQLAlchemy models
- `frontend/` — React + TypeScript + Vite SPA

## รันโปรเจกต์บนเครื่อง (local)

### Backend

```bash
cd backend
python -m venv venv
./venv/Scripts/activate        # Windows
pip install -r requirements.txt
cp .env.example .env           # แก้ JWT_SECRET ตามต้องการ; ค่า default ใช้ SQLite ในเครื่องได้เลย
uvicorn app.main:app --reload --port 8000
```

เปิด `http://localhost:8000/docs` เพื่อดู API (Swagger)

### Frontend

```bash
cd frontend
npm install
cp .env.example .env           # VITE_API_URL ชี้ไป backend (default: http://localhost:8000)
npm run dev
```

เปิด `http://localhost:5173`

### ทดสอบ backend

```bash
cd backend
pytest -q
```

## Deploy ขึ้น Cloud

### Backend + Database → Render

1. Push โค้ดขึ้น GitHub
2. สร้าง Postgres database ใหม่บน Render (หรือใช้ [Neon](https://neon.tech) ฟรี)
3. สร้าง Web Service ใหม่ ชี้ไปที่ repo นี้ folder `backend/` (Render จะใช้ `backend/Dockerfile` อัตโนมัติถ้าตั้ง root directory เป็น `backend`)
4. ตั้งค่า Environment Variables ตาม `backend/.env.example`:
   - `DATABASE_URL` — connection string จาก Postgres ที่สร้างไว้
   - `JWT_SECRET` — สุ่มค่าใหม่ (อย่าใช้ค่า default)
   - `CORS_ORIGINS` — URL ของ frontend หลัง deploy (เช่น `https://your-app.vercel.app`)
5. Deploy แล้วจดโดเมนที่ได้ (เช่น `https://coconut-dss-api.onrender.com`)

### Frontend → Vercel

1. Import repo นี้เข้า Vercel, ตั้ง Root Directory เป็น `frontend`
2. ตั้งค่า Environment Variable: `VITE_API_URL` = โดเมน backend จาก Render
3. Deploy — Vercel จะ build ด้วย `npm run build` อัตโนมัติ

หลัง deploy ทั้งสองฝั่งแล้ว อย่าลืมกลับไปอัปเดต `CORS_ORIGINS` บน Render ให้ตรงกับโดเมน Vercel จริง แล้ว redeploy backend อีกครั้ง

## การใช้งาน

1. สมัครสมาชิก / เข้าสู่ระบบ
2. ไปที่หน้า "ข้อมูล" — อัปโหลดไฟล์ตามเทมเพลต หรือกด "โหลดข้อมูลตัวอย่าง"
3. ไปที่หน้า "พยากรณ์" — เลือกโมเดลและระยะเวลา แล้วกด "เทรนโมเดล"
4. ดูผลภาพรวมที่หน้า "แดชบอร์ด" และเปรียบเทียบโมเดลที่หน้า "เปรียบเทียบโมเดล"
