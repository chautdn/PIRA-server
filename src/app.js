require('dotenv').config();
const connectToDatabase = require('./config/database');
const app = require('./config/express');

const PORT = process.env.PORT || 5000;

connectToDatabase();

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
