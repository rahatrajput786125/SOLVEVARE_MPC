const http = require('http');
const fs = require('fs');
const token = JSON.parse(fs.readFileSync('login_response.json','utf8')).data.token;
const projectId = '6a0f5ec4e49c96fad4467008';

const options = {
  hostname: 'localhost',
  port: 4000,
  path: `/api/v1/projects/${projectId}/templates`,
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
  },
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log(res.statusCode, body.slice(0,500));
    fs.writeFileSync('templates_response.json', body);
  });
});
req.on('error', (e) => console.error(e));
req.end();
