const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");

dotenv.config();

const SECRET = process.env.JWT_SECRET || "your-secret-key";

// Create a buyer token (user ID 7, companyId 0, non-admin)
const payload = {
  sub: "7",
  roleId: "2",
  isAdmin: false,
  companyId: "0",
};

const token = jwt.sign(payload, SECRET, { expiresIn: "1h" });
console.log("Buyer Token:", token);

// Make a request with fetch
const https = require("https");
const http = require("http");

const url = new URL("http://localhost:3001/api/r_buyer_offer");

const options = {
  hostname: url.hostname,
  port: url.port,
  path: url.pathname,
  method: "GET",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
};

const req = http
  .request(options, (res) => {
    let data = "";
    res.on("data", (chunk) => {
      data += chunk;
    });
    res.on("end", () => {
      console.log("Response Status:", res.statusCode);
      try {
        const json = JSON.parse(data);
        console.log("Response Data:", JSON.stringify(json, null, 2));
      } catch {
        console.log("Response Text:", data);
      }
    });
  })
  .on("error", (err) => {
    console.error("Error:", err.message);
  });

req.end();
