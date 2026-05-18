-- Seed demo data (only inserts if shops table is empty)

INSERT OR IGNORE INTO shops (id,code,name,address,phone,created_at,updated_at,is_active,last_login_at,owner_name,business_type,owner_mobile,remarks,suspend_reason)
VALUES(1,'DEMO01','iDine Demo Restaurant','123 Main Street, Colombo','+94 11 234 5678',1779041572000,1779041572000,1,1779043926,NULL,NULL,NULL,NULL,NULL);

INSERT OR IGNORE INTO users (id,shop_id,username,password_hash,role,is_active,created_at,updated_at)
VALUES(1,1,'admin','$2b$10$R3wuzhqdtCtfa.papC9lQuvvCZmoOqhZSfbb9/jh5Eohu7UW9qTbu','admin',1,1779041594,1779041594);

INSERT OR IGNORE INTO categories (id,shop_id,name,sort_order,created_at,updated_at,deleted_at) VALUES
(1,1,'Starters',0,1779041594,1779041594,NULL),
(2,1,'Rice & Noodles',1,1779041594,1779041594,NULL),
(3,1,'Grills',2,1779041594,1779041594,NULL),
(4,1,'Burgers',3,1779041594,1779041594,NULL),
(5,1,'Beverages',4,1779041594,1779041594,NULL),
(6,1,'Desserts',5,1779041594,1779041594,NULL);

INSERT OR IGNORE INTO products (id,shop_id,category_id,name,description,price,image_url,is_available,created_at,updated_at,deleted_at) VALUES
(1,1,1,'Spring Rolls (4 pcs)','Crispy vegetable spring rolls',350.0,NULL,1,1779041594,1779041594,NULL),
(2,1,1,'Chicken Wings','Spicy buffalo chicken wings',550.0,NULL,1,1779041594,1779041594,NULL),
(3,1,1,'Prawn Cocktail','Chilled prawns with cocktail sauce',650.0,NULL,1,1779041594,1779041594,NULL),
(4,1,2,'Chicken Fried Rice','Wok-fried rice with chicken',480.0,NULL,1,1779041594,1779041594,NULL),
(5,1,2,'Seafood Noodles','Stir-fried noodles with seafood',620.0,NULL,1,1779041594,1779041594,NULL),
(6,1,2,'Veg Fried Rice','Classic veggie fried rice',380.0,NULL,1,1779041594,1779041594,NULL),
(7,1,3,'Grilled Chicken','Half grilled chicken with sides',1200.0,NULL,1,1779041594,1779041594,NULL),
(8,1,3,'BBQ Ribs','Slow-cooked pork ribs',1500.0,NULL,1,1779041594,1779041594,NULL),
(9,1,3,'Fish on the Grill','Fresh catch grilled to perfection',980.0,NULL,1,1779041594,1779041594,NULL),
(10,1,4,'Classic Beef Burger','Beef patty with lettuce & cheese',650.0,NULL,1,1779041594,1779041594,NULL),
(11,1,4,'Chicken Burger','Crispy chicken fillet burger',550.0,NULL,1,1779041594,1779041594,NULL),
(12,1,4,'Veggie Burger','Garden patty with fresh veggies',450.0,NULL,1,1779041594,1779041594,NULL),
(13,1,5,'Fresh Lime Juice','Squeezed lime with soda',180.0,NULL,1,1779041594,1779041594,NULL),
(14,1,5,'Mango Lassi','Chilled mango yogurt drink',220.0,NULL,1,1779041594,1779041594,NULL),
(15,1,5,'Soft Drink','Coke, Sprite, Fanta',150.0,NULL,1,1779041594,1779041594,NULL),
(16,1,5,'Mineral Water','500ml bottled water',80.0,NULL,1,1779041594,1779041594,NULL),
(17,1,6,'Chocolate Lava Cake','Warm cake with molten center',420.0,NULL,1,1779041594,1779041594,NULL),
(18,1,6,'Ice Cream (3 scoops)','Vanilla, Chocolate, Strawberry',350.0,NULL,1,1779041594,1779041594,NULL),
(19,1,6,'Watalappan','Traditional Sri Lankan dessert',280.0,NULL,1,1779041594,1779041594,NULL);
