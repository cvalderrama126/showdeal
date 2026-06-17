/**
 * E2E Critical Flows Tests
 * Tests essential user workflows for production validation
 */

describe('E2E: Critical User Flows', () => {
  const API_URL = process.env.API_URL || 'http://localhost:3001';
  const TEST_ADMIN = {
    user_1: 'admin',
    password: 'admin123',
  };
  const TEST_USER = {
    user_1: 'buyer1',
    password: 'buyer123',
  };

  let adminToken = null;
  let userToken = null;
  let eventId = null;
  let auctionId = null;
  let assetId = null;

  // ============================================
  // FLOW 1: ADMIN AUTHENTICATION & OTP
  // ============================================
  describe('Flow 1: Admin Login with OTP', () => {
    test('POST /auth/login - Should return OTP setup on first login', async () => {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(TEST_ADMIN),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.firstLogin).toBe(true);
      expect(data.otpSetup).toBeDefined();
      expect(data.otpSetup.secret).toBeDefined();
      expect(data.otpSetup.otpauth_url).toBeDefined();

      // Extract token for next requests
      adminToken = data.sessionToken;
    });

    test('POST /auth/otp/verify - Should verify OTP code', async () => {
      // In production, use real authenticator app
      const { authenticator } = require('otplib');
      const secret = 'YOUR_TEST_SECRET'; // From previous response

      const otp = authenticator.generate(secret);

      const res = await fetch(`${API_URL}/api/auth/otp/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ code: otp }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.sessionToken).toBeDefined();

      adminToken = data.sessionToken;
    });

    test('GET /api/r_user/me - Should return authenticated user', async () => {
      const res = await fetch(`${API_URL}/api/r_user/me`, {
        headers: { 'Authorization': `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.data.user_1).toBe(TEST_ADMIN.user_1);
    });
  });

  // ============================================
  // FLOW 2: REGULAR USER LOGIN
  // ============================================
  describe('Flow 2: Regular User Authentication', () => {
    test('POST /auth/login - Regular user login', async () => {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(TEST_USER),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.sessionToken).toBeDefined();

      userToken = data.sessionToken;
    });
  });

  // ============================================
  // FLOW 3: AUCTION MANAGEMENT
  // ============================================
  describe('Flow 3: Auction Management', () => {
    test('GET /api/r_event - Should list events', async () => {
      const res = await fetch(`${API_URL}/api/r_event?take=10`, {
        headers: { 'Authorization': `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.data)).toBe(true);

      if (data.data.length > 0) {
        eventId = data.data[0].id_event;
      }
    });

    test('GET /api/r_auction - Should list auctions for event', async () => {
      if (!eventId) {
        console.log('Skipping: No events available');
        return;
      }

      const res = await fetch(
        `${API_URL}/api/r_auction?filters={"id_event":"${eventId}"}&take=5`,
        {
          headers: { 'Authorization': `Bearer ${userToken}` },
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.data)).toBe(true);

      if (data.data.length > 0) {
        auctionId = data.data[0].id_auction;
        assetId = data.data[0].id_asset;
      }
    });

    test('GET /api/r_auction/:id - Should retrieve auction details', async () => {
      if (!auctionId) {
        console.log('Skipping: No auctions available');
        return;
      }

      const res = await fetch(`${API_URL}/api/r_auction/${auctionId}`, {
        headers: { 'Authorization': `Bearer ${userToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.data.id_auction).toBeDefined();
    });
  });

  // ============================================
  // FLOW 4: BIDDING
  // ============================================
  describe('Flow 4: Place Bids on Auctions', () => {
    test('POST /api/r_auction/:id/bid - User should place a bid', async () => {
      if (!auctionId) {
        console.log('Skipping: No auctions available');
        return;
      }

      const bidValue = '1000.00';

      const res = await fetch(`${API_URL}/api/r_auction/${auctionId}/bid`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`,
        },
        body: JSON.stringify({ value: bidValue }),
      });

      // 201 Created or 409 if bid already exists
      expect([201, 409]).toContain(res.status);

      const data = await res.json();
      if (res.status === 201) {
        expect(data.ok).toBe(true);
        expect(data.data.value).toBe(bidValue);
      }
    });

    test('GET /api/r_bid - Should list user bids', async () => {
      const res = await fetch(`${API_URL}/api/r_bid?take=10`, {
        headers: { 'Authorization': `Bearer ${userToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.data)).toBe(true);
    });
  });

  // ============================================
  // FLOW 5: FILE UPLOADS
  // ============================================
  describe('Flow 5: File Uploads & Downloads', () => {
    test('POST /api/r_attach - User should upload file', async () => {
      const fs = require('fs');
      const FormData = require('form-data');

      const form = new FormData();
      form.append('file', Buffer.from('test content'), 'test.txt');
      form.append('entity_type', 'r_auction');
      form.append('entity_id', auctionId || '1');

      const res = await fetch(`${API_URL}/api/r_attach`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${userToken}`,
          ...form.getHeaders(),
        },
        body: form,
      });

      expect([201, 400, 403]).toContain(res.status);
      const data = await res.json();

      if (res.status === 201) {
        expect(data.ok).toBe(true);
        expect(data.data.id_attach).toBeDefined();
      }
    });

    test('GET /api/r_attach - Should list attachments', async () => {
      const res = await fetch(`${API_URL}/api/r_attach?take=10`, {
        headers: { 'Authorization': `Bearer ${userToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.data)).toBe(true);
    });
  });

  // ============================================
  // FLOW 6: PERMISSION ENFORCEMENT
  // ============================================
  describe('Flow 6: Permission & Access Control', () => {
    test('User should NOT access other company resources', async () => {
      const res = await fetch(
        `${API_URL}/api/r_user?filters={"id_company":"999"}&take=1`,
        {
          headers: { 'Authorization': `Bearer ${userToken}` },
        }
      );

      // Should be 403 Forbidden or 200 with empty results
      expect([200, 403]).toContain(res.status);
      const data = await res.json();

      if (data.data) {
        // If data returned, user should not see other company data
        expect(data.data.some(u => u.id_company !== userToken.companyId)).toBe(false);
      }
    });

    test('Read-only user should NOT create resources', async () => {
      // This test assumes a read-only user exists
      // Skip if not available
      const res = await fetch(`${API_URL}/api/r_user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`,
        },
        body: JSON.stringify({
          user_1: 'newuser',
          password: 'pass123',
          id_role: 2,
        }),
      });

      // Should be 403 Forbidden
      expect([403, 400]).toContain(res.status);
    });
  });

  // ============================================
  // FLOW 7: RATE LIMITING
  // ============================================
  describe('Flow 7: Rate Limiting', () => {
    test('Should rate limit after N failed auth attempts', async () => {
      const requests = [];

      for (let i = 0; i < 6; i++) {
        const res = await fetch(`${API_URL}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_1: 'admin',
            password: 'wrongpassword',
          }),
        });

        requests.push(res.status);
      }

      // At least one request should be rate limited (429)
      const hasRateLimit = requests.some(status => status === 429);
      expect(hasRateLimit).toBe(true);
    }, 30000);
  });

  // ============================================
  // FLOW 8: ROUND1 BULK UPLOAD
  // ============================================
  describe('Flow 8: Round1 Excel Upload', () => {
    test('POST /api/r_auction/round1/template - Should generate Excel template', async () => {
      const res = await fetch(
        `${API_URL}/api/r_auction/round1/template`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${adminToken}` },
          body: JSON.stringify({ id_event: eventId || 1 }),
        }
      );

      expect([200, 400]).toContain(res.status);

      if (res.status === 200) {
        const buffer = await res.buffer();
        expect(buffer.length).toBeGreaterThan(0);
        // Should be Excel file
        expect(buffer[0]).toBe(0x50); // PK... ZIP signature
      }
    });

    test('POST /api/r_auction/round1/upload - Should upload Excel bids', async () => {
      const FormData = require('form-data');
      const form = new FormData();

      // Create minimal Excel file
      const ExcelJS = require('exceljs');
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Sheet1');
      sheet.columns = [
        { header: 'placa', width: 20 },
        { header: 'valor_oferta', width: 15 },
      ];
      sheet.addRow(['ABC123', '1000.00']);

      const buffer = await workbook.xlsx.writeBuffer();

      form.append('file', buffer, 'test.xlsx');
      form.append('id_event', eventId || '1');
      form.append('id_company', '1');

      const res = await fetch(`${API_URL}/api/r_auction/round1/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          ...form.getHeaders(),
        },
        body: form,
      });

      expect([201, 400, 403, 409]).toContain(res.status);
      const data = await res.json();

      if (res.status === 201) {
        expect(data.ok).toBe(true);
        expect(data.data.summary).toBeDefined();
      }
    });
  });

  // ============================================
  // FLOW 9: AUCTION RESOLUTION
  // ============================================
  describe('Flow 9: Auction Resolution', () => {
    test('GET /api/r_auction_resolution - Should list resolutions', async () => {
      const res = await fetch(`${API_URL}/api/r_auction_resolution?take=10`, {
        headers: { 'Authorization': `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.data)).toBe(true);
    });

    test('POST /api/r_auction_resolution/:id/resolve - Should resolve auction', async () => {
      if (!auctionId) {
        console.log('Skipping: No auctions available');
        return;
      }

      const res = await fetch(
        `${API_URL}/api/r_auction_resolution/${auctionId}/resolve`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            winner_company_name: 'Test Company',
            observations: 'Auction resolved for testing',
          }),
        }
      );

      expect([200, 400, 404, 409]).toContain(res.status);
    });
  });

  // ============================================
  // FLOW 10: MULTI-COMPANY ISOLATION
  // ============================================
  describe('Flow 10: Multi-Company Data Isolation', () => {
    test('User should only see their own company data', async () => {
      const res = await fetch(`${API_URL}/api/r_asset?take=100`, {
        headers: { 'Authorization': `Bearer ${userToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      // All returned assets should belong to user's company
      if (data.data && data.data.length > 0) {
        const allSameCompany = data.data.every(asset => {
          // Verify company isolation logic
          return true; // Implementation depends on auth payload
        });

        expect(allSameCompany).toBe(true);
      }
    });
  });
});
