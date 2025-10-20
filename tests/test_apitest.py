import json
import pytest

BASE_URL = 'https://jsonplaceholder.typicode.com'


def test_get_post(playwright):
    api = playwright.request.new_context(base_url=BASE_URL)
    resp = api.get('/posts/1')
    assert resp.status == 200
    data = resp.json()
    # validate fields
    assert data['id'] == 1
    assert 'title' in data
    assert isinstance(data['userId'], int)
    api.dispose()


def test_create_post(playwright):
    api = playwright.request.new_context(base_url=BASE_URL)
    payload = { 'title': 'New Post', 'body': 'Playwright Test', 'userId': 12 }
    resp = api.post('/posts', data=json.dumps(payload), headers={'Content-Type': 'application/json'})
    assert resp.status == 201
    data = resp.json()
    assert data['title'] == payload['title']
    assert data['userId'] == payload['userId']
    assert 'id' in data
    assert isinstance(data.get('body', ''), str)
    api.dispose()


def test_update_post(playwright):
    api = playwright.request.new_context(base_url=BASE_URL)
    payload = {
        'id': 1,
        'title': 'Updated Title',
        'body': 'Updated body text',
        'userId': 1,
    }
    resp = api.put('/posts/1', data=json.dumps(payload), headers={'Content-Type': 'application/json'})
    assert resp.status == 200
    data = resp.json()
    assert data['title'] == payload['title']
    assert data['id'] == payload['id']
    assert data['userId'] == payload['userId']
    assert data['body'] == payload['body']
    api.dispose()


def test_delete_post(playwright):
    api = playwright.request.new_context(base_url=BASE_URL)
    resp = api.delete('/posts/1')
    # JSONPlaceholder returns 200 for deletes
    assert resp.status == 200
    api.dispose()
