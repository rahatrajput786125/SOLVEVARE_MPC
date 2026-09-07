const http = require('http');
const fs = require('fs');
const token = JSON.parse(fs.readFileSync('login_response.json','utf8')).data.token;

const options = {
  hostname: 'localhost',
  port: 4000,
  path: `/api/v1/projects`,
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
  },
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log(res.statusCode);
    fs.writeFileSync('projects_response.json', body);
    console.log(body);
  });
});
req.on('error', (e) => console.error(e));
req.end();
