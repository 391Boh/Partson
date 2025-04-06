// app/api/proxy.js
import { NextResponse } from 'next/server';

export async function GET(request) {
  const apiUrl = 'http://192.168.0.101/RetailShopAuto1/hs/serv/getdata'; // Ваш API

  const response = await fetch(apiUrl, {
    method: 'GET',
    headers: {
      'Authorization': 'Basic ' + Buffer.from('admin:').toString('base64'), // Додайте ваш логін і пароль
      'Content-Type': 'application/json',
    },
  });

  const data = await response.json();

  return NextResponse.json(data);
}

export async function POST(request) {
  const apiUrl = 'http://192.168.0.101/RetailShopAuto1/hs/serv/getdata'; // Ваш API

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from('admin:').toString('base64'),
      'Content-Type': 'application/json',
    },
    body: await request.text(), // передаємо вміст запиту
  });

  const data = await response.json();

  return NextResponse.json(data);
}
