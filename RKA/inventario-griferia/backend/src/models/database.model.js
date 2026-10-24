const pool = require("../config/db");

class DatabaseModel {
  static query(text, params) {
    return pool.query(text, params);
  }

  static connect() {
    return pool.connect();
  }
}

module.exports = DatabaseModel;
