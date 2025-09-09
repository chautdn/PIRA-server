const connectToDatabase = require('./config/database');
const app = require('./config/express');

const PORT = process.env.PORT || 3000;

connectToDatabase();




app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
