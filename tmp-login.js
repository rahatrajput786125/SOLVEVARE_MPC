const http = require('http');
const data = JSON.stringify({ email: 'rahatrajput@example.com', password: '12345678' });

const options = {
  hostname: 'localhost',
  port: 4000,
  path: '/api/v1/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length,
  },
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log(body);
    require('fs').writeFileSync('login_response.json', body);
  });
});
req.on('error', (e) => console.error(e));
req.write(data);
req.end();
