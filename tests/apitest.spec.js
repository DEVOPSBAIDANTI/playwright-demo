import {test, expect} from '@playwright/test';
const BASE_URL= 'https://jsonplaceholder.typicode.com';
test.describe('API tests for Playwright', () => {
test('GET /posts returns a list of posts', async ({request}) => {
    const response = await request.get(`${BASE_URL}/posts/1`);
    expect(response.status()).toBe(200);
    const posts = await response.json();
   // expect(Array.isArray(posts)).toBe(true);
   console.log(posts);
    //expect(posts.length).toBeGreaterThan(0);
    expect(posts.id).toBe(1);
    expect(posts).toHaveProperty('title');
    expect(typeof posts.userId).toBe('number');
    });

test('POST /posts should create a new post', async ({request}) => {
    
    const payload = { title: 'New Post', body: 'Playwright Test', userId: 12 };
    const response = await request.post(`${BASE_URL}/posts`, { data: payload });
    expect(response.status()).toBe(201);
    const posts = await response.json();
   // expect(Array.isArray(posts)).toBe(true);
   // expect(posts.length).toBeGreaterThan(0);
   console.log(posts);
    expect(posts.title).toBe(payload.title);
    expect(posts.userId).toBe(payload.userId);
    expect(posts).toHaveProperty('id');
    expect(typeof posts.body).toBe('string');
    });

test('PUT /posts/1 - should update an existing post', async ({ request }) => {
    const payload = {
      id: 1,
      title: 'Updated Title',
      body: 'Updated body text',
      userId: 1,
    };

    const response = await request.put(`${BASE_URL}/posts/1`, { data: payload });
    expect(response.status()).toBe(200);
    const data = await response.json();

    expect(data.title).toBe(payload.title);
    expect(data.id).toBe(payload.id);
    expect(data.userId).toBe(payload.userId);
    expect(data.body).toBe(payload.body);
  });

    test('DELETE /posts/1 - should delete the post', async ({ request }) => {
    const response = await request.delete(`${BASE_URL}/posts/1`);
    expect(response.status()).toBe(200);
  });
});
// more tests can be added here
// e.g., test for POST, PUT, DELETE endpoints
// test('POST /posts creates a new post', async ({request}) => { ... });
