# ♻️ Smart Waste ERP

Smart Waste ERP is a **role-based waste management system** designed to streamline municipal waste operations.  
It helps manage waste collection, bin monitoring, recycling, staff and vehicle management, complaints, finance tracking, and salary management through a centralized dashboard.

🔗 **Live Demo:** https://smartwaste-erp.netlify.app/  
💻 **GitHub:** https://github.com/SANGAVI-KRISH

---

# 🚀 Features

- Role-based authentication and authorization
- Dashboard with operational summary
- Waste collection tracking
- Bin status monitoring
- Staff and vehicle management
- Recycling management
- Complaint tracking system
- Finance management module
- Salary history with PDF export
- Reports generation
- Profile management
- Password update
- Live location map view

---

# 👥 System Roles

| Role | Access |
|-----|------|
| Admin | Full system access |
| Worker | Waste collection and task management |
| Driver | Transport tasks and collection |
| Recycling Manager | Recycling operations |

Each role sees only **authorized modules and navigation menus**.

---

# 🏗 System Architecture

```
Frontend (HTML, CSS, JavaScript)
        │
        │ REST API
        ▼
Backend (Node.js + Express)
        │
        ▼
Supabase Database & Authentication
```

---

# 🛠 Tech Stack

## Frontend
- HTML
- CSS
- JavaScript

## Backend
- Node.js
- Express.js

## Database & Authentication
- Supabase

## Deployment

| Component | Platform |
|----------|---------|
| Frontend | Netlify |
| Backend | Render |
| Database | Supabase |

---

# 📁 Project Structure

```
SmartWasteERP
│
├── frontend
│   ├── dashboard.html
│   ├── profile.html
│   ├── users.html
│   ├── collection.html
│   ├── bins.html
│   ├── tasks.html
│   ├── staff_vehicle.html
│   ├── recycling.html
│   ├── finance.html
│   ├── report.html
│   ├── complaints.html
│   ├── map.html
│   ├── style.css
│   └── js
│       ├── apiClient.js
│       ├── app.js
│       ├── dashboard.js
│       ├── profile.js
│
└── backend
    ├── server.js
    ├── controllers
    ├── routes
    ├── middleware
    └── package.json
```

---

# ⚙️ Installation

## 1. Clone Repository

```bash
git clone https://github.com/SANGAVI-KRISH/SmartWasteERP.git
cd SmartWasteERP
```

---

# 🖥 Backend Setup

Navigate to backend folder:

```bash
cd backend
```

Install dependencies:

```bash
npm install
```

### Required Packages

- express
- cors
- dotenv
- jsonwebtoken
- @supabase/supabase-js
- pdfkit

Install manually if needed:

```bash
npm install express cors dotenv jsonwebtoken @supabase/supabase-js pdfkit
```

---

# 🔑 Environment Variables

Create `.env` file inside **backend folder**

```
PORT=5000

SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

JWT_SECRET=your_secret_key
```

---

# ▶ Run Backend

```
npm start
```

Backend will run at:

```
http://localhost:5000
```

---

# 🌐 Frontend Setup

Open the **frontend folder** using:

- VS Code Live Server
- Any static server

Ensure backend API URL is set correctly in:

```
js/apiClient.js
```

Example for local development:

```
http://localhost:5000
```

Example for production:

```
https://your-render-backend-url.onrender.com
```

---

# 🔗 Important API Routes

| Method | Endpoint | Description |
|------|------|------|
| POST | /api/login | User login |
| GET | /api/me | Get current user |
| GET | /api/profile/me | Fetch profile data |
| PATCH | /api/profile/password | Update password |
| GET | /api/salary/my-history | Salary history |
| GET | /api/salary/export-pdf | Export salary PDF |

---

# 🔒 Security Features

- JWT authentication
- Role-based access control
- Protected backend routes
- Secure session handling

---

# 📈 Future Enhancements

- Real-time bin monitoring
- Notification system
- Advanced analytics dashboard
- Mobile responsive UI
- GPS vehicle tracking
- AI-based waste prediction

---

# 👨‍💻 Author

**Sangavi K**  
B.Tech Information Technology  
PSG College of Technology  

GitHub  
https://github.com/SANGAVI-KRISH