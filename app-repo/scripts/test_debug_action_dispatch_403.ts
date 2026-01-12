import http from 'http';

const postData = JSON.stringify({
  sourceBlockId: "X",
  actionName: "ping",
  payload: {}
});

const options = {
  hostname: '127.0.0.1',
  port: 3000,
  path: '/api/debug/action/dispatch',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

console.log(`Sending POST to http://${options.hostname}:${options.port}${options.path}`);

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log(`Status Code: ${res.statusCode}`);
    
    if (res.statusCode !== 403) {
        console.error(`FAIL: Expected 403, got ${res.statusCode}`);
        process.exit(1);
    }

    try {
        const json = JSON.parse(data);
        console.log("Response Body:", json);
        
        if (json.error && json.error.includes("Forbidden: Developer Mode required")) {
            console.log("PASS: Correctly received 403 Forbidden with expected message.");
            process.exit(0);
        } else {
             console.error(`FAIL: Unexpected error message body`);
             process.exit(1);
        }
    } catch (e) {
        console.error("FAIL: Could not parse response JSON", data);
        process.exit(1);
    }
  });
});

req.on('error', (e) => {
  console.error(`FAIL: Request error: ${e.message}`);
  if ((e as any).code === 'ECONNREFUSED') {
      console.error("-> The server appears to be down. Please run 'npm run dev:server' in a separate terminal.");
  }
  process.exit(1);
});

req.write(postData);
req.end();
