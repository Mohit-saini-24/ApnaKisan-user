const functions = require('firebase-functions');
const admin = require('firebase-admin')
const express = require('express')
const app = express();

var serviceAccount = require("./service.json");

const path = require('path');
const cors = require('cors');
const moment = require('moment');

const engine = require('ejs-locals');

app.engine('ejs', engine);
app.set('views', path.join(__dirname, '/views'));
app.set('view engine', 'ejs');
app.use('/public', express.static('public'))
app.use(cors({ origin: true }))

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://apnakisan-cfe53.firebaseio.com"
});


const db = admin.firestore();
const cookieParser = require('cookie-parser')
const bodyParser = require('body-parser')

// app.use('/cart',express.static('../public'))
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))
// app.set('trust proxy', true) // specify a single subnet

function attachCsrfToken(url, cookie, value) {
    return function (req, res, next) {
        if (req.url === url) {
            res.cookie(cookie, value);
        }
        next();
    }
}

function checkIfSignedIn(url) {
    return function (req, res, next) {
        if (req.url === url) {
            const sessionCookie = req.cookies.__session || '';
            // User already logged in. Redirect to profile page.
            admin.auth().verifySessionCookie(sessionCookie).then(async (decodedClaims) => {
                // const userRecord = await admin.auth().getUser(decodedClaims.sub).then((userRecord) => {
                //     return userRecord;
                // })
                // res.locals.user = userRecord.uid
                // console.log('decoded claims....')
                // console.log(userRecord.uid)
                return res.redirect('/home');
            }).catch((error) => {
                console.log(error)
                next();
            });
        } else {
            next();
            return;
        }
    }
}

// function saveUserIP(req,res,next){
//     console.log('user IP Adderss :' +req.ip)
//     next();
// }

app.use(cookieParser());

app.use(attachCsrfToken('/', 'csrfToken', (Math.random() * 100000000000000000).toString()));

app.use(checkIfSignedIn('/',));
// app.use(saveUserIP)

app.get('/', (req, res) => {
    res.render('index')
})


/** Session login endpoint. */
app.post('/sessionLogin', (req, res) => {
    // Get ID token and CSRF token.
    const idToken = req.body.idToken.toString();
    const csrfToken = req.body.csrfToken.toString();
    // Guard against CSRF attacks.
    if (!req.cookies || csrfToken !== req.cookies.csrfToken) {
        res.status(401).send('UNAUTHORIZED REQUEST!');
        return;
    }
    // Set session expiration to 5 days.
    const expiresIn = 60 * 60 * 24 * 5 * 1000;
    // Create the session cookie. This will also verify the ID token in the process.
    // The session cookie will have the same claims as the ID token.
    // We could also choose to enforce that the ID token auth_time is recent.
    admin.auth().verifyIdToken(idToken).then((decodedClaims) => {
        console.log('session login............')
        // In this case, we are enforcing that the user signed in in the last 5 minutes.
        if (new Date().getTime() / 1000 - decodedClaims.auth_time < 5 * 60) {
            return admin.auth().createSessionCookie(idToken, { expiresIn: expiresIn });
        }
        throw new Error('UNAUTHORIZED REQUEST!');
    }).then((sessionCookie) => {
        // Note httpOnly cookie will not be accessible from javascript.
        // secure flag should be set to true in production.
        const options = { maxAge: expiresIn, httpOnly: true, secure: false /** to test in localhost */ };
        res.cookie('__session', sessionCookie, options);
        return res.end(JSON.stringify({ status: 'success' }));
    }).catch((error) => {
        console.log('UNAUTHORIZED REQUEST')
        res.status(401).send('UNAUTHORIZED REQUEST!');
    });
});

/** User signout endpoint. */
app.get('/logout', (req, res) => {
    // Clear cookie.
    const sessionCookie = req.cookies.__session || '';
    res.clearCookie('__session');
    // Revoke session too. Note this will revoke all user sessions.
    if (sessionCookie) {
        admin.auth().verifySessionCookie(sessionCookie, true).then((decodedClaims) => {
            return admin.auth().revokeRefreshTokens(decodedClaims.sub);
        })
            .then(() => {
                // Redirect to login page on success.
                return res.redirect('/');
            }).catch(() => {
                // Redirect to login page on error.
                res.redirect('/');
            });
    } else {
        // Redirect to login page when no session cookie available.
        res.redirect('/');
    }
});

app.get('/home', async (req, res) => {
    res.set('Cache-Control', 'private, max-age=31557600');

    // console.log(res.locals.user)
    // Get session cookie.
    const sessionCookie = req.cookies.__session || '';
    // Get the session cookie and verify it. In this case, we are verifying if the
    // Firebase session was revoked, user deleted/disabled, etc.
    const userRecord = await admin.auth().verifySessionCookie(sessionCookie, true /** check if revoked. */)
        .then((decodedClaims) => {
            // Serve content for signed in user.
            return admin.auth().getUser(decodedClaims.sub).then((userRecord) => {
                return userRecord;
            })
        }).catch((error) => {
            // Force user to login.
            res.redirect('/');
        });

    var heroQuery = db.collection('products').doc('All Products').collection('Products').orderBy("sold", "desc").limit(5);

    var seedQuery, herbicideQuery, fungicideQuery, insecticideQuery, fertilizerQuery, otherQuery;

    seedQuery = db.collection('products').doc('All Products').collection('Products').where("category", "==", "Seed").limit(5);
    herbicideQuery = db.collection('products').doc('All Products').collection('Products').where("category", "==", "Herbicide").limit(5);
    fungicideQuery = db.collection('products').doc('All Products').collection('Products').where("category", "==", "Fungicide").limit(5);
    insecticideQuery = db.collection('products').doc('All Products').collection('Products').where("category", "==", "Insecticide").limit(5);
    fertilizerQuery = db.collection('products').doc('All Products').collection('Products').where("category", "==", "Fertilizer").limit(5)
    otherQuery = db.collection('products').doc('All Products').collection('Products').where("category", "==", "Other").limit(5)


    var allProductsQuery = db.collection('products').doc('All Products').collection('Products');
    var searchQuery = db.collection('products').doc('search');

    const data = [];
    const categoryData = [];
    const searchData = [];
    const seedData = [];
    const herbicideData = [];
    const fungicideData = [];
    const fertilizerData = [];
    const insecticideData = [];
    const otherData = [];
    const heroProducts = await heroQuery.get().then((querySnapshot) => {
        querySnapshot.forEach(async snapshot => {
            //console.log(snapshot.id+'===>>'+snapshot.data().productURL);
            try {
                // var image = await Jimp.read(snapshot.data().productURL);
                // //image.cover(300,300)
                // image.resize(200, 200)
                // //image.brightness(0.8);          // adjust the brighness by a value -1 to +1
                // //image.contrast(0);
                // new Jimp(256, 256, '#fff', async (err, newimage) => {
                //     // this image is 256 x 256, every pixel is set to 0xFF0000FF
                //     if (err) { console.log(err); return }
                //     // var image = await Jimp.read(snapshot.data().productURL);
                //     //image.cover(300,300)
                //     //image.resize(100, 100)
                //     newimage.composite(image, 28, 28, {
                //         mode: Jimp.BLEND_SOURCE_OVER,
                //         opacityDest: 0.1,
                //         opacitySource: 1
                //     }, (err, image) => {
                //         if (err) { console.log(err); return }
                //         image.getBase64(Jimp.AUTO, (err, image) => {
                //             if (err) { console.log(err); return }
                //             return image;
                //         });
                //     })
                //     const font = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);
                //     newimage.print(font, 50, 228, snapshot.data().productName);
                //     await newimage.writeAsync(`public/img/dynamic/${snapshot.data().productName}_150x150.jpg`);
                //     return;
                // });
                // // var img64 = await newImage.getBase64Async(Jimp.AUTO);
                // product.data.text2 = img64

                let temp = {};
                //temp.buffer = newImage;
                temp.data = snapshot;
                // console.log(temp.buffer)
                data.push(temp)

            } catch (error) {
                console.log(error)
                return res.send(error)
            }
        })
        return data;
    }).catch(error => res.send('hero query error..' + error));

    const searchQueryData = await searchQuery.get().then((searchQuery) => {
        //console.log(searchQuery.data().search.length)
        //searchData.push(searchQuery.data().search);
        searchData.push(searchQuery.data().search);
        return searchData;
    }).catch(error => res.send('search query error......' + error))
    // console.log(searchQueryData[0])

    const seedRec = await seedQuery.get().then((seedproducts) => {

        seedproducts.docs.forEach(doc => {
            // seedData.push({
            //     id: doc.id,
            //     data: doc.data()
            // });
            categoryData.push({
                id: doc.id,
                data: doc.data()
            });
        })
        /// console.log(categoryData)
        return seedData;
    }).catch(error => res.send("error getting seeds.." + error));

    const herbiRec = await herbicideQuery.get().then((herbicideProducts) => {
        herbicideProducts.docs.forEach(doc => {
            // herbicideData.push({
            //     id: doc.id,
            //     data: doc.data()
            // });
            categoryData.push({
                id: doc.id,
                data: doc.data()
            });
        })
        return herbicideData;
    }).catch(error => res.send("error getting seeds.." + error))

    const fungicideRec = await fungicideQuery.get().then((fungiproducts) => {
        fungiproducts.docs.forEach(doc => {
            // fungicideData.push({
            //     id: doc.id,
            //     data: doc.data()
            // });
            categoryData.push({
                id: doc.id,
                data: doc.data()
            });
        })

        return fungicideData;
    }).catch(error => res.send("error getting seeds.." + error))

    const fertilizerRec = await fertilizerQuery.get().then((fertilizerproducts) => {
        fertilizerproducts.docs.forEach(doc => {
            // fertilizerData.push({
            //     id: doc.id,
            //     data: doc.data()
            // });
            categoryData.push({
                id: doc.id,
                data: doc.data()
            });
        })

        return fertilizerData;
    }).catch(error => res.send("error getting seeds.." + error))

    var insecticideRec = await insecticideQuery.get().then((insectProducts) => {
        insectProducts.docs.forEach(doc => {
            // insecticideData.push({
            //     id: doc.id,
            //     data: doc.data()
            // });
            categoryData.push({
                id: doc.id,
                data: doc.data()
            });
        })
        return categoryData;
    }).catch(error => res.send("error getting seeds.." + error))

    var otherRec = await otherQuery.get().then((products) => {
        products.docs.forEach(doc => {
            // insecticideData.push({
            //     id: doc.id,
            //     data: doc.data()
            // });
            categoryData.push({
                id: doc.id,
                data: doc.data()
            });
        })
        return categoryData;
    }).catch(error => res.send("error getting seeds.." + error))

    // console.log(userRecord)
    const cartlength = await db.collection('users').doc(userRecord.uid).collection('cart').get().then((snapshot) => {
        return snapshot.docs.length;
    }).catch(error => res.send('error getting cart length...' + error))

    res.render('home', { heroProducts, searchQueryData: searchQueryData[0], productsReveived: otherRec, userRecord, cartlength })
})

app.get('/product/:id', async (req, res) => {

    // const uid = req.cookies.userid
    var productid = req.params.id;
    //console.log(productid);
    var productref = db.collection('products').doc('All Products').collection('Products').doc(productid);
    const product = await productref.get().then((product) => {
        return product;
    }).catch(error => res.send('product get error....' + error))
    res.render('pages/productdetail', { product: product })
})

app.post('/cart/:id', async (req, res) => {
    // Get session cookie.
    const sessionCookie = req.cookies.__session || '';
    // Get the session cookie and verify it. In this case, we are verifying if the
    // Firebase session was revoked, user deleted/disabled, etc.
    const userRecord = await admin.auth().verifySessionCookie(sessionCookie, true /** check if revoked. */)
        .then((decodedClaims) => {
            // Serve content for signed in user.
            return admin.auth().getUser(decodedClaims.sub).then((userRecord) => {
                return userRecord;
            })
        }).catch((error) => {
            // Force user to login.
            res.redirect('/');
        });
    const uid = userRecord.uid

    //const uid = cookie;
    var addProductNameHindi = req.body.addProductNameHindi
    var varName = req.body.addVarientName;
    var varQty = req.body.addToCartQty;
    // console.log(uid, varName, varQty, addProductNameHindi)
    //console.log(cookie.split("_")[0])

    const productid = req.params.id;
    //console.log('product id............' + productid)
    var cartRef = db.collection('users').doc(uid);
    const updateValue = await cartRef.collection('cart').get().then(async (querySnapshot) => {
        var update = false;
        let snapshotId;
        for (let index = 0; index < querySnapshot.docs.length; index++) {
            const snapshot = querySnapshot.docs[index];
            if (snapshot.data().productID === productid) {
                if (snapshot.data().varientName === varName) {
                    snapshotId = snapshot.id;
                    break;
                }
            }
        }
        if (snapshotId) {
            var newProductQty = Number(varQty) + 1;
            update = await cartRef.collection('cart').doc(snapshotId).update({
                productQty: newProductQty
            }).then(() => {
                //console.log(ref.id);
                return true;
            }).catch(error => res.send('increment cart error' + error));
        } else {
            var cart = {
                productQty: varQty,
                productID: productid,
                varientName: varName,
                productNameHindi: addProductNameHindi
            }
            update = await cartRef.collection('cart').add(cart).then((docRef) => {
                return false;
            }).catch(error => res.send("Error adding document: " + error));
        }
        return update;
    }).catch(error => res.send('index route roor........' + error))
    res.redirect('/cart');
    // console.log('update..............' + updateValue)
    // if (updateValue) {
    //     // return res.append('Success', 'Increment by one')
    //     // return res.redirect(req.get('referer'));
    //     return res.json("increment by one");
    // } else {
    //     return res.json("new product added");
    // }
})

app.get('/cart', async (req, res) => {
    // Get session cookie.
    const sessionCookie = req.cookies.__session || '';
    // Get the session cookie and verify it. In this case, we are verifying if the
    // Firebase session was revoked, user deleted/disabled, etc.
    const userRecord = await admin.auth().verifySessionCookie(sessionCookie, true /** check if revoked. */)
        .then((decodedClaims) => {
            // Serve content for signed in user.
            return admin.auth().getUser(decodedClaims.sub).then((userRecord) => {
                return userRecord;
            })
        }).catch((error) => {
            // Force user to login.
            res.redirect('/');
        });
    const uid = userRecord.uid

    try {
        var temp = [];
        const cartItems = await db.collection("users").doc(uid).collection("cart").get().then((querySnapshot) => {
            querySnapshot.forEach((doc) => {
                let item = {
                    id: String
                }
                item.id = doc.id;
                item.data = doc.data();
                temp.push(item);
                //            getCartItem(doc.data().productID, doc.data().productQty, doc.data().varientName, doc.id);
            });
            return temp;
            //console.log(cartItems)
            // cartItems;

        }).catch(error => res.send('error getting user cart..........' + error))
        var cartTotal = 0;
        var cartTotalOriginal = 0;
        // console.log(cartItems)

        var cartItemDetails = [];
        // use promise.all instead of using await in for loop
        // map is a very good function
        const promises = cartItems.map(async (data, id) => {
            // console.log("promises..............")
            // console.log(data.data.productID,id)
            const productid = data.data.productID;
            var item = data;
            const product = await db.collection('products').doc('All Products').collection('Products').doc(productid).get().then((snapshot) => {
                var product = snapshot.data()
                let detail = {
                    cartId: String,
                    productURL: String,
                    productName: String,
                    productNameHindi: String,
                    varientName: String,
                    priceOriginal: Number,
                    discountPrice: Number,
                    varientQty: Number,
                    itemTotal: Number
                }
                detail.cartId = item.id;
                detail.productURL = product.productURL;
                detail.productName = product.productName;
                detail.productNameHindi = product.productNameHindi;
                detail.varientName = item.data.varientName;

                product.varients.forEach(varient => {
                    if (varient.varientName === item.data.varientName) {
                        detail.priceOriginal = varient.priceOriginal;
                        detail.discountPrice = varient.discountPrice;
                        detail.itemTotal = item.data.productQty * varient.discountPrice;
                        cartTotal = cartTotal + item.data.productQty * varient.discountPrice;
                        cartTotalOriginal = cartTotalOriginal + item.data.productQty * varient.priceOriginal
                    }
                });
                detail.varientQty = item.data.productQty;

                return detail;
                // console.log(cartItemDetails)
            }).catch(error => res.send("database query error" + error))
            return cartItemDetails.push(product);
        })
        await Promise.all(promises);
        res.render('pages/shoppingcart', { cartItemDetails, cartTotal, cartTotalOriginal })
    } catch (error) {
        res.send('index page error...' + error)
    }

    // console.log("...............................==>>")
    // console.log(cartItemDetails);   

})

app.post('/incrementCart/:id/:qty', async (req, res) => {

    // Get session cookie.
    const sessionCookie = req.cookies.__session || '';
    // Get the session cookie and verify it. In this case, we are verifying if the
    // Firebase session was revoked, user deleted/disabled, etc.
    const userRecord = await admin.auth().verifySessionCookie(sessionCookie, true /** check if revoked. */)
        .then((decodedClaims) => {
            // Serve content for signed in user.
            return admin.auth().getUser(decodedClaims.sub).then((userRecord) => {
                return userRecord;
            })
        }).catch((error) => {
            // Force user to login.
            res.redirect('/');
        });
    const uid = userRecord.uid

    var cartItemId1 = req.params.id;
    //console.log(cartItemId1)
    var pqty = Number(req.params.qty) + 1;
    // [START update_document]
    var cartref = db.collection('users').doc(uid).collection("cart").doc(cartItemId1)

    // Set the "capital" field of the city 'DC'
    const verdict = await cartref.update({
        productQty: pqty
    }).then(() => {
        return true;
    }).catch(error => res.send("unable to update cart " + error));
    res.redirect('/cart')
    // [END update_document]
})
app.post('/decrementCart/:id/:qty', async (req, res) => {
    // Get session cookie.
    const sessionCookie = req.cookies.__session || '';
    // Get the session cookie and verify it. In this case, we are verifying if the
    // Firebase session was revoked, user deleted/disabled, etc.
    const userRecord = await admin.auth().verifySessionCookie(sessionCookie, true /** check if revoked. */)
        .then((decodedClaims) => {
            // Serve content for signed in user.
            return admin.auth().getUser(decodedClaims.sub).then((userRecord) => {
                return userRecord;
            })
        }).catch((error) => {
            // Force user to login.
            res.redirect('/');
        });
    const uid = userRecord.uid

    var cartItemId1 = req.params.id;
    //console.log(cartItemId1)
    var pqty = Number(req.params.qty) - 1;
    // [START update_document]
    var cartref = db.collection('users').doc(uid).collection("cart").doc(cartItemId1)

    // Set the "capital" field of the city 'DC'
    return cartref.update({
        productQty: pqty
    }).then(() => {
        return res.redirect('/cart')
    }).catch(error => res.json("unable to update cart " + error));
})
app.post('/removeFromCart/:id', async (req, res) => {
    // Get session cookie.
    const sessionCookie = req.cookies.__session || '';
    // Get the session cookie and verify it. In this case, we are verifying if the
    // Firebase session was revoked, user deleted/disabled, etc.
    const userRecord = await admin.auth().verifySessionCookie(sessionCookie, true /** check if revoked. */)
        .then((decodedClaims) => {
            // Serve content for signed in user.
            return admin.auth().getUser(decodedClaims.sub).then((userRecord) => {
                return userRecord;
            })
        }).catch((error) => {
            // Force user to login.
            res.redirect('/');
        });
    const uid = userRecord.uid

    var cartItemId1 = req.params.id;
    db.collection('users').doc(uid).collection("cart")
        .doc(cartItemId1).delete().then(() => {
            return res.redirect('/cart');
        }).catch(error => res.json("unable to update cart " + error));
})

app.post('/checkout', async (req, res) => {
    // Get session cookie.
    const sessionCookie = req.cookies.__session || '';
    // Get the session cookie and verify it. In this case, we are verifying if the
    // Firebase session was revoked, user deleted/disabled, etc.
    const userRecord = await admin.auth().verifySessionCookie(sessionCookie, true /** check if revoked. */)
        .then((decodedClaims) => {
            // Serve content for signed in user.
            return admin.auth().getUser(decodedClaims.sub).then((userRecord) => {
                return userRecord;
            })
        }).catch((error) => {
            // Force user to login.
            res.redirect('/');
        });
    const uid = userRecord.uid

    // final checkout query

    // receive cart total credentials
    var items = [];
    var cartSubTotal = req.body.cartSubTotal;
    cartSubTotal = Number(cartSubTotal);
    var cartTotal = req.body.cartTotalOriginal
    cartTotal = Number(cartTotal)
    if (cartSubTotal === 0) {
        return res.redirect('/')
        //res.send("please add something in cart")
    }
    // console.log(cartSubTotal + '===>>>' + cartTotal)

    // create a random 6 digit number
    var randomid = Math.floor(100000 + Math.random() * 900000)
    // go to cart of current user
    var cartRef = db.collection('users').doc(uid).collection('cart');
    // copy the contents of cart to new collection order
    var orderItemstemp = [];
    const orderItems = await cartRef.get().then((cartitems) => {
        cartitems.docs.forEach(item => {
            orderItemstemp.push({
                id:item.id,
                data:item.data()
            })
        })
        return orderItemstemp;
    }).catch(error => res.send("error receive cart items" + error))

    console.log(orderItems)
    // create new order document save cart contents as map, and save 5 digit number as document key..
    await db.collection('apnakisanorders').add({
        userid: uid,
        orderkey: randomid,
        orderItems: orderItems,
        orderTotal: cartTotal,
        amountToPay: cartSubTotal,
        saving: cartTotal - cartSubTotal,
        orderTime:new Date()
    }).catch(error => res.send("apna kisan add order error..." + error))


    var orderRef = db.collection('users').doc(uid).collection('orders');

    await orderRef.add({
        orderkey: randomid,
        orderItems: orderItems,
        orderTotal: cartTotal,
        amountToPay: cartSubTotal,
        saving: cartTotal - cartSubTotal,
        orderTime:new Date()
    }).catch(error => res.send("order add error....." + error))
    // save the contents of cart order collection of currentuser 
    //await db.collection('users').doc(uid).collection('cart').delete().then(() => { return })

    const collectionRef = db.collection('users').doc(uid).collection('cart');
    const query = collectionRef.orderBy('productID').limit(2);

    return new Promise((resolve, reject) => {
        deleteQueryBatch(db, query, resolve).catch(reject);
    });

    async function deleteQueryBatch(db, query, resolve) {
        const snapshot = await query.get();
        const batchSize = snapshot.size;
        if (batchSize === 0) {
            // When there are no documents left, we are done
            resolve();
            console.log(orderItems)
            res.render('pages/checkout', { orderItems, randomid, cartSubTotal, cartTotal })
            return;
        }

        // Delete documents in a batch
        const batch = db.batch();
        snapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
        });
        await batch.commit();

        // Recurse on the next process tick, to avoid
        // exploding the stack.
        process.nextTick(() => {
            deleteQueryBatch(db, query, resolve);
        });
    }
})

app.get('/orders', async (req, res) => {
    // Get session cookie.
    const sessionCookie = req.cookies.__session || '';
    // Get the session cookie and verify it. In this case, we are verifying if the
    // Firebase session was revoked, user deleted/disabled, etc.
    const userRecord = await admin.auth().verifySessionCookie(sessionCookie, true /** check if revoked. */)
        .then((decodedClaims) => {
            // Serve content for signed in user.
            return admin.auth().getUser(decodedClaims.sub).then((userRecord) => {
                return userRecord;
            })
        }).catch((error) => {
            // Force user to login.
            res.redirect('/');
        });
    const uid = userRecord.uid

    order = 'a'
    const temp = [];
    const data = await db.collection('users').doc(uid).collection('orders').get().then((querySnapshot) => {

        for (let index = 0; index < querySnapshot.docs.length; index++) {
            const doc = querySnapshot.docs[index];
            //console.log(doc.id)
            //console.log(doc.data().orderkey)
            temp.push(doc.data())
        }
        return temp;
    }).catch(error => res.send("error getting orders..." + error))
    console.log(data)
    return res.render('pages/orders', { data, order,moment });
})

app.get('/shop/:category', async (req, res) => {
    var category = req.params.category
    res.set('Cache-Control', 'private, max-age=31557600');

    const sessionCookie = req.cookies.__session || '';
    // Get the session cookie and verify it. In this case, we are verifying if the
    // Firebase session was revoked, user deleted/disabled, etc.
    const userRecord = await admin.auth().verifySessionCookie(sessionCookie, true /** check if revoked. */)
        .then((decodedClaims) => {
            // Serve content for signed in user.
            return admin.auth().getUser(decodedClaims.sub).then((userRecord) => {
                return userRecord;
            })
        }).catch((error) => {
            // Force user to login.
            res.redirect('/');
        });
    const uid = userRecord.uid

    console.log('shop route..........' + category)
    const searchData = [];
    const categoryData = [];
    var searchQuery = db.collection('products').doc('search');
    const searchQueryData = await searchQuery.get().then((searchQuery) => {
        //console.log(searchQuery.data().search.length)
        //searchData.push(searchQuery.data().search);
        searchData.push(searchQuery.data().search);
        return searchData;
    }).catch(error => res.send('search query error......' + error))
    var catQuery;
    if (category === 'all') {
        catQuery = db.collection('products').doc('All Products').collection('Products');
    } else {
        catQuery = db.collection('products').doc('All Products').collection('Products').where("category", "==", category);
    }
    const categoryProducts = await catQuery.get().then((products) => {
        products.docs.forEach(doc => {
            // fertilizerData.push({
            //     id: doc.id,
            //     data: doc.data()
            // });
            categoryData.push({
                id: doc.id,
                data: doc.data()
            });
        })
        return categoryData;
    }).catch(error => res.send("error getting category products.." + error))

    const cartlength = await db.collection('users').doc(userRecord.uid).collection('cart').get().then((snapshot) => {
        return snapshot.docs.length;
    }).catch(error => res.send('error getting cart length...' + error))
    // res.send(category)
    res.render('pages/shop', { searchQueryData: searchQueryData[0], categoryProducts, category, cartlength, userRecord })
})


exports.app = functions.https.onRequest(app)