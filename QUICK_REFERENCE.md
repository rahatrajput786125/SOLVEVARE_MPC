# 🎯 Quick Reference - MPC SEO Platform

## 🚀 Quick Start (5 Minutes)

```bash
# 1. Setup fresh user
node fresh-user-setup.js

# 2. Create test project
node create-test-project.js

# 3. Open in browser
http://localhost:3000/projects/{PROJECT_ID}
```

---

## 📝 Create Your First Project

### Step 1: Login
```
URL: http://localhost:3000/login
Email: test@example.com
Password: Test123456!
```

### Step 2: Create Project
```
Dashboard → New Project
Name: My SEO Project
Slug: my-seo-project
```

### Step 3: Create Template
```
Templates → Create Template
Name: City Service Page

Title: Best {{service}} in {{city}} | {{brand}}
Description: Professional {{service}} in {{city}}. Call {{phone}}!
Slug: {{service}}-{{city}}
Content: [Your HTML with {{variables}}]
```

### Step 4: Upload Data
```
Data Sources → Upload CSV

Format:
service,city,phone,brand
Plumbing,Mumbai,+91-12345,MyBrand
Electrical,Delhi,+91-67890,MyBrand
```

### Step 5: Generate Pages
```
Pages → Generate Pages
Select: Template + Data Source
Click: Generate
Wait: 1-2 minutes
```

---

## 🎨 Template Variables

### Common Variables:
```
{{service}}        - Service name (Plumbing, Electrical)
{{city}}          - City name (Mumbai, Delhi)
{{state}}         - State name (Maharashtra, Delhi)
{{phone}}         - Phone number (+91-12345-67890)
{{email}}         - Email address
{{address}}       - Physical address
{{brand}}         - Brand/Company name
{{experience}}    - Years of experience
{{nearby_areas}}  - Nearby locations
```

### Usage in Template:
```html
<h1>Best {{service}} in {{city}}, {{state}}</h1>
<p>Call us at {{phone}} for {{service}} services</p>
<p>Serving {{city}} and {{nearby_areas}}</p>
```

---

## 📊 CSV Format

### Basic Format:
```csv
service,city,state,phone,email
Plumbing,Mumbai,Maharashtra,+91-12345,info@example.com
Electrical,Delhi,Delhi,+91-67890,info@example.com
```

### Rules:
- ✅ First row = Column names
- ✅ Match template variables
- ✅ No empty cells
- ✅ Use commas to separate
- ✅ One row = One page

---

## 🔍 SEO Optimization

### Title Tag (50-60 chars):
```
✅ Best Plumbing Services in Mumbai | Licensed | MyBrand
❌ Plumbing
```

### Meta Description (150-160 chars):
```
✅ Need plumbers in Mumbai? ⭐ Licensed ⭐ 24/7 Service ⭐ Free Quotes. Call +91-12345!
❌ We do plumbing
```

### URL Slug:
```
✅ plumbing-services-mumbai
❌ page123 or plumbing_mumbai
```

### Content:
```
✅ 500+ words
✅ Include keywords naturally
✅ Add FAQ section
✅ Use H1, H2, H3 tags
✅ Add internal links
```

---

## 🏆 SEO Score Guide

### Score Breakdown:
- **90-100:** Excellent ⭐⭐⭐⭐⭐
- **80-89:** Good ⭐⭐⭐⭐
- **70-79:** Average ⭐⭐⭐
- **Below 70:** Needs Work ⭐⭐

### Improve Score:
1. ✅ Optimize title length (50-60 chars)
2. ✅ Optimize description (150-160 chars)
3. ✅ Add H1 tag with keyword
4. ✅ Add alt text to images
5. ✅ Add schema markup
6. ✅ Add internal links
7. ✅ Increase content length (500+ words)

---

## 🛠️ Common Commands

### Fix User Issues:
```bash
node fresh-user-setup.js      # Delete and recreate user
node check-user.js            # Check if user exists
```

### Create Test Project:
```bash
node create-test-project.js   # Auto-create full project
```

### Test API:
```bash
node test-pages-endpoint.js   # Test pagination fix
```

### MongoDB Commands:
```bash
# Connect
mongosh "mongodb://localhost:27017/mpc_dev?replicaSet=rs0"

# Check users
db.users.find({email: 'test@example.com'})

# Delete user
db.users.deleteOne({email: 'test@example.com'})

# Check projects
db.projects.find()
```

---

## 🌐 Important URLs

### Frontend:
```
Login:        http://localhost:3000/login
Dashboard:    http://localhost:3000/dashboard
Project:      http://localhost:3000/projects/{ID}
Templates:    http://localhost:3000/projects/{ID}/templates
Data Sources: http://localhost:3000/projects/{ID}/data-sources
Pages:        http://localhost:3000/projects/{ID}/pages
SEO:          http://localhost:3000/projects/{ID}/seo
```

### API:
```
Base URL:     http://localhost:4000/api/v1
Health:       http://localhost:4000/api/v1/health
Docs:         http://localhost:4000/api/docs
```

---

## 🐛 Troubleshooting

### Error: "property page should not exist"
```bash
# Already fixed! Just restart API server
cd apps\api
npm run dev
```

### Error: 409 User already exists
```bash
node fresh-user-setup.js
```

### Error: 401 Unauthorized
```
Solution: Login again at http://localhost:3000/login
```

### Error: Pages not generating
```
Solution: Start worker
cd apps\worker
npm run dev
```

### Error: CSV upload fails
```
Solution: Check S3/R2 credentials in apps/api/.env
```

---

## 📈 Performance Tips

### For Faster Generation:
1. ✅ Keep CSV under 1000 rows
2. ✅ Use simple templates
3. ✅ Avoid heavy images
4. ✅ Run worker service

### For Better SEO:
1. ✅ Unique content per page
2. ✅ Location-specific keywords
3. ✅ Add schema markup
4. ✅ Internal linking
5. ✅ Mobile-friendly design

---

## 🎓 Example Templates

### Service + City:
```
Title: Best {{service}} in {{city}} | {{brand}}
Slug: {{service}}-{{city}}
```

### Product + Location:
```
Title: Buy {{product}} in {{city}} | Best Prices
Slug: {{product}}-{{city}}
```

### Job + City:
```
Title: {{job_title}} Jobs in {{city}} | Apply Now
Slug: {{job_title}}-jobs-{{city}}
```

---

## 📞 Quick Help

### Services Running?
```bash
# Check ports
netstat -an | findstr :3000  # Web
netstat -an | findstr :4000  # API
netstat -an | findstr :6379  # Redis
netstat -an | findstr :27017 # MongoDB
```

### Logs Location:
```
API Logs: c:\Users\DELL\Desktop\MPC\api.log
Browser: F12 → Console tab
```

---

## ✨ Pro Tips

1. **Use Variables Wisely:** More variables = More flexibility
2. **Test First:** Create 2-3 pages before bulk generation
3. **Optimize Titles:** Include location + service + brand
4. **Add FAQs:** Great for SEO and user experience
5. **Internal Links:** Link related pages together
6. **Schema Markup:** Helps Google understand your content
7. **Mobile First:** Most users are on mobile
8. **Fast Loading:** Optimize images and code

---

## 🎯 Success Checklist

- [ ] User created and logged in
- [ ] Project created
- [ ] Template created with variables
- [ ] CSV uploaded with data
- [ ] Pages generated successfully
- [ ] SEO optimized (score 80+)
- [ ] Schema markup added
- [ ] Pages published/exported

---

**Need detailed guide? Check:** `COMPLETE_USER_GUIDE.md`

**Happy SEO! 🚀**
