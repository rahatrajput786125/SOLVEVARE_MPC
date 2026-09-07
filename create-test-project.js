const axios = require('axios');
const fs = require('fs');
const path = require('path');

const API_URL = 'http://localhost:4000/api/v1';
let authToken = '';

// Helper function for API calls
async function apiCall(method, endpoint, data = null, headers = {}) {
  try {
    const config = {
      method,
      url: `${API_URL}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
        ...headers,
      },
    };
    
    if (data) {
      config.data = data;
    }
    
    const response = await axios(config);
    return response.data;
  } catch (error) {
    console.error(`Error in ${method} ${endpoint}:`, error.response?.data || error.message);
    throw error;
  }
}

// Step 1: Register/Login
async function authenticate() {
  console.log('🔐 Authenticating...');
  
  const email = 'test@example.com';
  const password = 'Test123456!';
  
  try {
    // Try to login first
    const loginRes = await apiCall('POST', '/auth/login', { email, password });
    authToken = loginRes.data.token;
    console.log('✅ Logged in successfully');
    console.log(`   User: ${loginRes.data.user.email}`);
    console.log(`   Org: ${loginRes.data.org.name}`);
    return loginRes.data;
  } catch (loginError) {
    console.log('⚠️  Login failed, trying to register...');
    
    try {
      // If login fails, try to register
      const registerRes = await apiCall('POST', '/auth/register', {
        email,
        password,
        name: 'Test User',
        orgName: 'Test Organization',
      });
      authToken = registerRes.data.token;
      console.log('✅ Registered successfully');
      console.log(`   User: ${registerRes.data.user.email}`);
      console.log(`   Org: ${registerRes.data.org.name}`);
      return registerRes.data;
    } catch (registerError) {
      console.error('❌ Both login and register failed!');
      console.error('   Login error:', loginError.response?.data?.error || loginError.message);
      console.error('   Register error:', registerError.response?.data?.error || registerError.message);
      console.error('\n💡 Solutions:');
      console.error('   1. Run: node fresh-user-setup.js (to delete and recreate user)');
      console.error('   2. Or use different credentials in this script');
      console.error('   3. Or manually delete user from MongoDB');
      throw new Error('Authentication failed');
    }
  }
}

// Step 2: Create Project
async function createProject() {
  console.log('\n📁 Creating project...');
  
  const project = await apiCall('POST', '/projects', {
    name: 'SEO Test Project',
    description: 'A test project for programmatic SEO',
    slug: 'seo-test-project',
  });
  
  console.log(`✅ Project created: ${project.data.name} (ID: ${project.data.id})`);
  return project.data;
}

// Step 3: Create Template
async function createTemplate(projectId) {
  console.log('\n📄 Creating template...');
  
  const template = await apiCall('POST', `/projects/${projectId}/templates`, {
    name: 'City Service Landing Page',
    description: 'Template for city-based service pages',
    content: `
<div class="container">
  <h1>Best {{service}} in {{city}}, {{state}}</h1>
  
  <div class="intro">
    <p>Looking for professional {{service}} in {{city}}? You've come to the right place!</p>
    <p>We provide top-quality {{service}} services throughout {{city}} and surrounding areas.</p>
  </div>
  
  <div class="features">
    <h2>Why Choose Our {{service}} Services?</h2>
    <ul>
      <li>✓ Licensed and Insured</li>
      <li>✓ 24/7 Emergency Service</li>
      <li>✓ Free Estimates</li>
      <li>✓ Satisfaction Guaranteed</li>
    </ul>
  </div>
  
  <div class="contact">
    <h2>Contact Us Today</h2>
    <p>Call us at {{phone}} or email {{email}}</p>
    <p>Serving {{city}}, {{state}} and nearby areas</p>
  </div>
  
  <div class="cta">
    <a href="/contact" class="btn">Get a Free Quote</a>
  </div>
</div>
    `.trim(),
    titleTemplate: 'Best {{service}} in {{city}}, {{state}} | Professional Services',
    descriptionTemplate: 'Looking for {{service}} in {{city}}? We offer professional {{service}} services in {{city}}, {{state}}. Call {{phone}} for a free quote today!',
    slugTemplate: '{{service}}-{{city}}-{{state}}',
  });
  
  console.log(`✅ Template created: ${template.data.name} (ID: ${template.data.id})`);
  return template.data;
}

// Step 4: Create CSV Data Source
async function createDataSource(projectId) {
  console.log('\n📊 Creating data source...');
  
  // Create CSV content
  const csvContent = `service,city,state,phone,email
Plumbing,New York,NY,555-0101,plumbing@example.com
Plumbing,Los Angeles,CA,555-0102,plumbing@example.com
Plumbing,Chicago,IL,555-0103,plumbing@example.com
Electrical,New York,NY,555-0201,electrical@example.com
Electrical,Los Angeles,CA,555-0202,electrical@example.com
Electrical,Chicago,IL,555-0203,electrical@example.com
HVAC,New York,NY,555-0301,hvac@example.com
HVAC,Los Angeles,CA,555-0302,hvac@example.com
HVAC,Chicago,IL,555-0303,hvac@example.com
Roofing,New York,NY,555-0401,roofing@example.com
Roofing,Los Angeles,CA,555-0402,roofing@example.com
Roofing,Chicago,IL,555-0403,roofing@example.com`;

  // Save CSV to temp file
  const csvPath = path.join(__dirname, 'temp-data.csv');
  fs.writeFileSync(csvPath, csvContent);
  
  // Create data source
  const dataSource = await apiCall('POST', `/projects/${projectId}/data-sources`, {
    name: 'City Services Data',
    type: 'CSV',
  });
  
  console.log(`✅ Data source created: ${dataSource.data.name} (ID: ${dataSource.data.id})`);
  
  // Upload CSV file
  console.log('📤 Uploading CSV file...');
  
  try {
    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', fs.createReadStream(csvPath));
    
    await axios.post(
      `${API_URL}/projects/${projectId}/data-sources/${dataSource.data.id}/upload`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          'Authorization': `Bearer ${authToken}`,
        },
      }
    );
    
    console.log('✅ CSV uploaded successfully');
  } catch (error) {
    console.log('⚠️  Upload failed, but data source created. You can upload manually.');
  }
  
  // Clean up temp file
  fs.unlinkSync(csvPath);
  
  return dataSource.data;
}

// Step 5: Generate Pages
async function generatePages(projectId, templateId, dataSourceId) {
  console.log('\n🚀 Triggering page generation...');
  
  try {
    const result = await apiCall('POST', `/projects/${projectId}/pages/generate`, {
      templateId,
      dataSourceId,
    });
    
    console.log(`✅ Page generation started! Estimated pages: ${result.data.estimatedPages}`);
    console.log('⏳ Pages will be generated in the background...');
    return result.data;
  } catch (error) {
    console.log('⚠️  Page generation failed. This might be because the worker is not running.');
    console.log('   You can still view the project and manually trigger generation from the UI.');
  }
}

// Main execution
async function main() {
  console.log('🎯 Creating Dummy SEO Project...\n');
  console.log('=' .repeat(60));
  
  try {
    // Step 1: Authenticate
    const auth = await authenticate();
    
    // Step 2: Create Project
    const project = await createProject();
    
    // Step 3: Create Template
    const template = await createTemplate(project.id);
    
    // Step 4: Create Data Source
    const dataSource = await createDataSource(project.id);
    
    // Step 5: Generate Pages
    await generatePages(project.id, template.id, dataSource.id);
    
    console.log('\n' + '=' .repeat(60));
    console.log('\n✨ SUCCESS! Your test project is ready!\n');
    console.log('📋 Project Details:');
    console.log(`   Name: ${project.name}`);
    console.log(`   ID: ${project.id}`);
    console.log(`   URL: http://localhost:3000/projects/${project.id}`);
    console.log('\n🔗 Quick Links:');
    console.log(`   Overview:     http://localhost:3000/projects/${project.id}`);
    console.log(`   Templates:    http://localhost:3000/projects/${project.id}/templates`);
    console.log(`   Data Sources: http://localhost:3000/projects/${project.id}/data-sources`);
    console.log(`   Pages:        http://localhost:3000/projects/${project.id}/pages`);
    console.log('\n💡 Next Steps:');
    console.log('   1. Open the project URL in your browser');
    console.log('   2. Check if pages are being generated');
    console.log('   3. If worker is running, pages will appear in a few seconds');
    console.log('\n');
    
  } catch (error) {
    console.error('\n❌ Error creating project:', error.message);
    process.exit(1);
  }
}

// Run the script
main();
