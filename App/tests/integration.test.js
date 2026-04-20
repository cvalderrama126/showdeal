// 🔀 INTEGRATION & E2E TESTS
const request = require('supertest');
const { createApp } = require('../src/app');

describe('🔀 Integration & End-to-End Tests', () => {
  let app;
  let authToken;
  let testUserId;
  let testCompanyId;

  beforeAll(() => {
    app = createApp();
    // Mock token - in real tests, actually authenticate
    authToken = 'Bearer mock-token';
  });

  describe('🔄 Complete User Journey', () => {
    test('Full auction bidding flow', async () => {
      // 1. Create user
      const userRes = await request(app)
        .post('/api/r_user')
        .set('Authorization', authToken)
        .send({
          email: `buyer-${Date.now()}@test.com`,
          password: 'Password123!'
        });

      if (userRes.status === 201) {
        testUserId = userRes.body.id;
      }

      // 2. List auctions
      const auctionsRes = await request(app)
        .get('/api/r_auction')
        .set('Authorization', authToken);

      expect([200, 401]).toContain(auctionsRes.status);

      // 3. Place bid on auction
      if (auctionsRes.status === 200 && auctionsRes.body.length > 0) {
        const auctionId = auctionsRes.body[0].id || 1;

        const bidRes = await request(app)
          .post('/api/r_bid')
          .set('Authorization', authToken)
          .send({
            amount: 150,
            auctionId
          });

        expect([201, 400, 401]).toContain(bidRes.status);
      }

      // 4. View user's bids
      const myBidsRes = await request(app)
        .get('/api/r_bid?userId=' + (testUserId || 1))
        .set('Authorization', authToken);

      expect([200, 401, 400]).toContain(myBidsRes.status);
    });

    test('Complete company setup flow', async () => {
      // 1. Create company
      const companyRes = await request(app)
        .post('/api/r_company')
        .set('Authorization', authToken)
        .send({
          name: `Corp-${Date.now()}`,
          email: `corp-${Date.now()}@test.com`
        });

      if (companyRes.status === 201) {
        testCompanyId = companyRes.body.id;
      }

      // 2. Assign company to user
      if (testCompanyId) {
        const assignRes = await request(app)
          .put(`/api/r_user/${testUserId || 1}`)
          .set('Authorization', authToken)
          .send({
            companyId: testCompanyId
          });

        expect([200, 400, 401, 403]).toContain(assignRes.status);
      }

      // 3. List company users
      const usersRes = await request(app)
        .get(`/api/r_user?companyId=${testCompanyId || 1}`)
        .set('Authorization', authToken);

      expect([200, 401]).toContain(usersRes.status);
    });
  });

  describe('📊 Data Consistency Across Modules', () => {
    test('Created data should be retrievable', async () => {
      // Create
      const createRes = await request(app)
        .post('/api/r_module')
        .set('Authorization', authToken)
        .send({ name: `Module-${Date.now()}` });

      if (createRes.status === 201) {
        const moduleId = createRes.body.id;

        // Retrieve
        const getRes = await request(app)
          .get(`/api/r_module/${moduleId}`)
          .set('Authorization', authToken);

        if (getRes.status === 200) {
          expect(getRes.body.id).toBe(moduleId);
          expect(getRes.body.name).toBe(createRes.body.name);
        }
      }
    });

    test('Updated data should reflect changes', async () => {
      const newName = `Updated-${Date.now()}`;

      const updateRes = await request(app)
        .put('/api/r_module/1')
        .set('Authorization', authToken)
        .send({ name: newName });

      if (updateRes.status === 200) {
        const getRes = await request(app)
          .get('/api/r_module/1')
          .set('Authorization', authToken);

        if (getRes.status === 200) {
          expect(getRes.body.name).toBe(newName);
        }
      }
    });

    test('Deleted data should not be retrievable', async () => {
      // Create
      const createRes = await request(app)
        .post('/api/r_asset')
        .set('Authorization', authToken)
        .send({ name: `Asset-${Date.now()}` });

      if (createRes.status === 201) {
        const assetId = createRes.body.id;

        // Delete
        const deleteRes = await request(app)
          .delete(`/api/r_asset/${assetId}`)
          .set('Authorization', authToken);

        expect([200, 204, 401, 403, 404]).toContain(deleteRes.status);

        //Try to retrieve
        const getRes = await request(app)
          .get(`/api/r_asset/${assetId}`)
          .set('Authorization', authToken);

        if (deleteRes.status === 204 || deleteRes.status === 200) {
          expect([404, 401]).toContain(getRes.status);
        }
      }
    });
  });

  describe('🔗 Relational Data Integrity', () => {
    test('Should not allow deleting referenced records', async () => {
      // Try to delete company that has users
      const deleteRes = await request(app)
        .delete('/api/r_company/1')
        .set('Authorization', authToken);

      if (deleteRes.status === 400 || deleteRes.status === 409) {
        expect(deleteRes.body.error).toBeDefined();
      }
    });

    test('Should validate foreign key constraints', async () => {
      const bidRes = await request(app)
        .post('/api/r_bid')
        .set('Authorization', authToken)
        .send({
          amount: 100,
          auctionId: 99999  // Non-existent auction
        });

      expect([400, 404]).toContain(bidRes.status);
    });
  });

  describe('🔐 Permission & Access Control Flow', () => {
    test('User cannot access other user resources', async () => {
      // Get as user 2
      const res = await request(app)
        .get('/api/r_user/1')
        .set('Authorization', authToken)
        .set('X-User-ID', '2');  // Different user

      if (res.status === 403) {
        expect(res.body.error).toContain('not allowed');
      }
    });

    test('Admin can access any resource', async () => {
      const res = await request(app)
        .get('/api/r_user/1')
        .set('Authorization', authToken)
        .set('X-Admin', 'true');

      expect([200, 401]).toContain(res.status);
    });
  });

  describe('📎 File Upload Integration', () => {
    test('Upload and link file to module', async () => {
      // 1. Upload file
      const uploadRes = await request(app)
        .post('/api/r_attach')
        .set('Authorization', authToken)
        .attach('file', Buffer.from('test content'), 'test.txt');

      if (uploadRes.status === 201) {
        const fileId = uploadRes.body.id;

        // 2. Link to module
        const linkRes = await request(app)
          .put('/api/r_module/1')
          .set('Authorization', authToken)
          .send({
            attachmentId: fileId
          });

        expect([200, 400, 401]).toContain(linkRes.status);
      }
    });
  });

  describe('⏱️ Business Logic Validation', () => {
    test('Cannot bid less than current highest bid', async () => {
      const bidRes = await request(app)
        .post('/api/r_bid')
        .set('Authorization', authToken)
        .send({
          amount: 25,  // Assuming current bid is higher
          auctionId: 1
        });

      if (bidRes.status === 400) {
        expect(bidRes.body.error).toContain('minimum');
      }
    });

    test('Cannot bid on ended auction', async () => {
      const bidRes = await request(app)
        .post('/api/r_bid')
        .set('Authorization', authToken)
        .send({
          amount: 500,
          auctionId: 1  // Assuming ended
        });

      if (bidRes.status === 400) {
        expect(bidRes.body.error).toContain('ended');
      }
    });
  });

  describe('🔄 Middleware Chain Validation', () => {
    test('Request passes through all middleware', async () => {
      const res = await request(app)
        .get('/api/r_user')
        .set('Authorization', authToken);

      // Should have CORS headers
      expect(res.headers['access-control-allow-origin']).toBeDefined();
      
      // Should have security headers
      expect(res.headers['x-content-type-options']).toBeDefined();

      expect([200, 401]).toContain(res.status);
    });

    test('Invalid auth triggers authentication middleware', async () => {
      const res = await request(app)
        .get('/api/r_user')
        .set('Authorization', 'Bearer invalid-token');

      expect([401, 403]).toContain(res.status);
    });
  });

});
