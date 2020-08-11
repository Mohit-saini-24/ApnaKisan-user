const firebase = require('firebase');
const firebaseui = require('firebaseui');
const $ = require('jquery');

var firebaseConfig = {
    apiKey: "AIzaSyBD1Os8BslXS6JfNjicK8l2FbmI9YtEr1w",
    authDomain: "apnakisan-cfe53.firebaseapp.com",
    databaseURL: "https://apnakisan-cfe53.firebaseio.com",
    projectId: "apnakisan-cfe53",
    appId: "1:347167391317:web:d6bec0dc2e9ee522e69edc",
    measurementId: "G-V0GCSJZGX5"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Set persistence to none.
firebase.auth().setPersistence(firebase.auth.Auth.Persistence.NONE);
// Initialize the FirebaseUI Widget using Firebase.
const ui = new firebaseui.auth.AuthUI(firebase.auth());

var uiConfig = {
    callbacks: {
        signInSuccessWithAuthResult: function (authResult, redirectUrl) {
            document.getElementById('login-page-text').style.display = "none";
            document.getElementById('login-page-animation').style.display = '';
            handleSignedInUser(authResult?.user);
            // Do not automatically redirect.
            return false;
        },
        uiShown: function () {
            document.getElementById('loader').style.display = 'none';
        }
    },
    // Will use popup for IDP Providers sign-in flow instead of the default, redirect.
    signInFlow: 'popup',
    signInSuccessUrl: '/',
    signInOptions: [
        {
            provider: firebase.auth.PhoneAuthProvider.PROVIDER_ID,
            recaptchaParameters: {
                size: 'invisible', // 'invisible' or 'compact'
                badge: 'bottomleft' //' bottomright' or 'inline' applies to invisible.
            },
            defaultCountry: 'IND',
            defaultNationalNumber: '',
            loginHint: '+91'
        }
    ],

    // Terms of service url.
    tosUrl: 'https://www.google.com',
    // Privacy policy url.
    privacyPolicyUrl: '<your-privacy-policy-url>'
};

const handleSignedInUser = function (user) {
    console.log(user)
    db.collection('users').doc(user?.uid).set({
        user: user?.uid,
        phoneNumber: user?.phoneNumber
    })
    // Show redirection notice.
    // document.getElementById('redirecting').classList.remove('hidden');
    // Set session cookie
    user.getIdToken().then((idToken) => {
        // Session login endpoint is queried and the session cookie is set.
        // CSRF token should be sent along with request.
        console.log(idToken)
        const csrfToken = getCookie('csrfToken')
        return postIdTokenToSessionLogin('/sessionLogin', idToken, csrfToken)
            .then(() => {
                // Redirect to profile on success.
                return window.location.assign('/home');
            }).catch(error => {
                console.log(error)
                return window.location.assign('/');
            })
    }).catch(error => {
        return window.location.assign('/');
    });
};

const postIdTokenToSessionLogin = function (url, idToken, csrfToken) {
    // POST to session login endpoint.
    console.log('post id token to session login')
    return $.ajax({
        type: 'POST',
        url: url,
        data: { idToken: idToken, csrfToken: csrfToken },
        contentType: 'application/x-www-form-urlencoded'
    });
};


function getCookie(name) {
    const v = document.cookie.match('(^|;) ?' + name + '=([^;]*)(;|$)');
    return v ? v[2] : null;
}
const initApp = function () {
    // Renders sign-in page using FirebaseUI.
    ui.start('#firebaseui-container', uiConfig);
    document.querySelector('.firebaseui-title').innerText = 'कृपया अपना मोबाइल नंबर डालें'
    document.querySelector('.firebaseui-title').style.textAlign = "center";
};

window.addEventListener('load', initApp);
