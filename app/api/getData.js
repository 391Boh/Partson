import axios from 'axios';

// Ваші облікові дані для Basic Auth (логін і пароль)
const username = 'your_username'; // Замініть на ваш логін
const password = 'your_password'; // Замініть на ваш пароль

// Кодуємо пару логін:пароль в Base64
const authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');

// Використовуємо axios для виконання запиту
axios.get('http://192.168.0.101/RetailShopAuto1/hs/serv/getdata', {
  headers: {
    'Authorization': authHeader,
  },
})
  .then(response => {
    console.log('Отримано дані:', response.data);
  })
  .catch(error => {
    console.error('Помилка при запиті:', error);
  });
