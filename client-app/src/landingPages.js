// Text for the keyword landing pages. All page copy lives here, one entry per page.
// Write only what the product really does (checked against the code):
//  - Tap an NFC card, or scan the QR printed on it, to open an online profile.
//  - The profile can show contact details, WhatsApp, Instagram, portfolio link,
//    address and a HuntsWorld listing link, and lets the visitor save the contact.
//  - The person receiving a tap or scan needs no app.
//  - Magic Posters play a video when scanned with the phone camera (no app).
// No prices, delivery times, discounts, awards or "#1" claims. Charges show at checkout.

const CITIES = 'Mumbai, Delhi NCR, Bengaluru, Hyderabad, Chennai, Pune, Kolkata, Ahmedabad and Jaipur';

const SHOP = { label: 'See cards in the shop', to: '/shop' };

export const LANDING_PAGES = [
  {
    path: '/nfc-business-card-india',
    title: 'NFC Business Card in India: Order Online | HuntsTAG',
    description:
      'Order a HuntsTAG NFC business card online in India. Tap it on a phone to share your contact, WhatsApp and portfolio. No app needed. Charges shown at checkout.',
    h1: 'NFC business card for India, ordered online',
    crumb: 'NFC business card India',
    lead: [
      'A HuntsTAG NFC business card holds a link to your online profile. Tap it on an NFC-enabled smartphone and your contact details, WhatsApp number, portfolio and social links open on their screen. The other person does not need to install an app.',
      'You can order the card online from anywhere in India, choose the plan that fits you, and fill in your details from your dashboard.',
    ],
    sections: [
      {
        h2: 'What the card does',
        body: [
          'The card opens a profile page. Your profile can show your contact details, WhatsApp number, Instagram, portfolio link, address and a link to your HuntsWorld listing. The visitor can save your details to their phone contacts in one tap.',
          'Every HuntsTAG card also has a QR code. If a phone does not support NFC, the person can scan the QR code and see the same profile.',
        ],
      },
      {
        h2: 'Why choose NFC over a paper card',
        body: [
          'A paper card has fixed details. If your number or website changes, you have to print again. With an NFC card, you edit your profile from your dashboard, so the next person who taps your card sees your latest details.',
          'There is nothing to type in and no card to lose in a pile of papers. The person you meet gets your profile straight on their phone.',
        ],
      },
      {
        h2: 'Order from anywhere in India',
        body: [
          `Most of our customers order online. We deliver across India, including ${CITIES}. Choose a plan in the shop, add your details and place your order. All charges are shown at checkout.`,
          'Not sure which plan to pick? The card catalog explains what each plan includes.',
        ],
      },
    ],
    faq: [
      { q: 'What is an NFC business card?', a: 'It is a card with a small NFC chip inside. When you tap it on an NFC-enabled phone, the phone opens your online profile with your contact details and links.' },
      { q: 'Does the other person need an app?', a: 'No. Tapping the card or scanning its QR code opens your profile in the phone browser. No app is needed to view it.' },
      { q: 'Can I change my details after I order?', a: 'Yes. You edit your profile from your dashboard, and your card opens the latest version.' },
      { q: 'Do you deliver across India?', a: 'Yes. We deliver across India. All charges are shown at checkout.' },
    ],
    related: ['/digital-visiting-card', '/nfc-card-without-app', '/qr-and-nfc-visiting-card', '/nfc-card-delivery-india'],
    cta: SHOP,
  },
  {
    path: '/digital-visiting-card',
    title: 'Digital Visiting Card: NFC Smart Visiting Card | HuntsTAG',
    description:
      'A HuntsTAG digital visiting card shares your contact, WhatsApp and portfolio with one tap. A smart NFC visiting card with a QR code, no app needed.',
    h1: 'Digital visiting card that works with one tap',
    crumb: 'Digital visiting card',
    lead: [
      'A digital visiting card keeps your details online instead of printing them on paper. The HuntsTAG smart visiting card is a physical card with an NFC chip that opens your online profile when it is tapped on a phone.',
      'You get the feel of a real card in your hand, with the details of a web page behind it.',
    ],
    sections: [
      {
        h2: 'How a smart visiting card works',
        body: [
          'Your profile is a web page with your name, contact details and links. The card has an NFC chip that points to that page. When someone taps the card on an NFC-enabled phone, the page opens. A QR code on the card does the same for phones that cannot read NFC.',
          'The person receiving it does not install anything. They see your profile in their browser.',
        ],
      },
      {
        h2: 'What you can put on it',
        body: [
          'Your profile can include your contact details, a WhatsApp number, an Instagram link, a portfolio or website link, your address and a link to your HuntsWorld listing. Visitors can save your contact to their phone with one tap.',
          'Some plans add extras such as animated 3D elements and Augmented Reality. The catalog shows what each plan includes.',
        ],
      },
      {
        h2: 'Who uses a digital visiting card',
        body: [
          'It suits anyone who meets people and wants to be easy to reach: shop owners, freelancers, consultants, agents, designers and teams who attend events. You hand over one card instead of a stack of paper.',
          'Because you edit the profile online, you never need to reprint when a detail changes.',
        ],
      },
    ],
    faq: [
      { q: 'What is the difference between a digital and a smart visiting card?', a: 'People use both names for the same idea: a card that opens your details online. Ours is a physical NFC card linked to your online profile.' },
      { q: 'What if the phone has no NFC?', a: 'Every card has a QR code. Scan it with the phone camera to open the same profile.' },
      { q: 'Can people save my number?', a: 'Yes. Your profile has a button that saves your contact details to the phone.' },
      { q: 'Can I update my profile later?', a: 'Yes, from your dashboard. The card keeps opening your latest profile.' },
    ],
    related: ['/nfc-business-card-india', '/whatsapp-nfc-card', '/instagram-nfc-card', '/hi/digital-visiting-card'],
    cta: SHOP,
  },
  {
    path: '/nfc-card-without-app',
    title: 'NFC Card Without App: Tap and Share a Profile | HuntsTAG',
    description:
      'The person you meet does not need an app to open your HuntsTAG NFC card. They tap or scan the QR code and your profile opens in their phone browser.',
    h1: 'NFC card that needs no app',
    crumb: 'NFC card without app',
    lead: [
      'Many people hesitate to share a link because the other person might need to download something first. With a HuntsTAG NFC card, they do not. Tapping the card or scanning its QR code opens your profile in the phone browser.',
      'That makes it quick to use at an event, in a meeting or at a shop counter.',
    ],
    sections: [
      {
        h2: 'How it opens without an app',
        body: [
          'The NFC chip in the card holds a web address. An NFC-enabled phone reads it and offers to open it, just like opening a link. The page is your HuntsTAG profile. There is no store page to visit and nothing to install.',
          'For phones that do not read NFC, the QR code on the card holds the same address. The phone camera scans it and opens the page.',
        ],
      },
      {
        h2: 'What the visitor sees',
        body: [
          'Your profile can show your contact details, WhatsApp, Instagram, portfolio link, address and HuntsWorld listing. The visitor can save your contact to their phone, call you or message you on WhatsApp from the page.',
        ],
      },
      {
        h2: 'A note on Augmented Reality',
        body: [
          'Viewing your normal profile needs no app. Augmented Reality features are available on some plans and are a separate experience from the basic tap-and-open profile. The catalog page explains which plans include them.',
        ],
      },
    ],
    faq: [
      { q: 'Do I need an app to use my own card?', a: 'You manage your profile from the website dashboard. Sharing the card needs nothing more than tapping it.' },
      { q: 'Does the person receiving it need an app?', a: 'No. Your profile opens in their phone browser after a tap or QR scan.' },
      { q: 'Does it work if the phone is locked?', a: 'That depends on the phone. Some phones read NFC with the screen on, others need it unlocked. The QR code always works with the camera.' },
      { q: 'Do I need internet to share it?', a: 'The person opening your profile needs an internet connection, because the profile is an online page.' },
    ],
    related: ['/nfc-business-card-india', '/qr-and-nfc-visiting-card', '/nfc-card-kya-hai'],
    cta: SHOP,
  },
  {
    path: '/whatsapp-nfc-card',
    title: 'WhatsApp NFC Card: Share Your Number With One Tap | HuntsTAG',
    description:
      'Add your WhatsApp number to a HuntsTAG NFC card. One tap opens your profile with a button that starts a WhatsApp chat. No app needed to view it.',
    h1: 'WhatsApp NFC card: share your number with one tap',
    crumb: 'WhatsApp NFC card',
    lead: [
      'In India, most business chats happen on WhatsApp. A HuntsTAG NFC card lets you put your WhatsApp number on your profile, so the person you meet can start a chat without typing your number.',
      'They tap your card, your profile opens, and a WhatsApp button is right there.',
    ],
    sections: [
      {
        h2: 'How the WhatsApp button works',
        body: [
          'You add your WhatsApp number to your profile from your dashboard. On your public profile, it shows as a WhatsApp button and in your contact details. Tapping the button opens a WhatsApp chat with your number.',
          'The visitor does not need to install anything to see your profile. WhatsApp itself opens only if they choose to chat.',
        ],
      },
      {
        h2: 'Share more than a number',
        body: [
          'Besides WhatsApp, your profile can show other contact details, an Instagram link, your portfolio, your address and a HuntsWorld listing link. Visitors can also save your contact to their phone.',
          'This is useful when you meet many people in a day and want them to reach you where they already chat.',
        ],
      },
      {
        h2: 'Keep your number up to date',
        body: [
          'If you change your WhatsApp number, update it in your dashboard. The card does not need to be replaced, because it opens your latest profile.',
        ],
      },
    ],
    faq: [
      { q: 'How do I share my WhatsApp number with one tap?', a: 'Add the number to your HuntsTAG profile. When someone taps your card, your profile opens with a WhatsApp button.' },
      { q: 'Does the other person need WhatsApp installed?', a: 'They need WhatsApp only to chat. Your profile itself opens in the browser without any app.' },
      { q: 'Can I hide my WhatsApp number?', a: 'Only details you add to your profile are shown. If you leave the field empty, no WhatsApp button appears.' },
      { q: 'Can I change the number later?', a: 'Yes. Update it in your dashboard and the card shows the new number.' },
    ],
    related: ['/instagram-nfc-card', '/digital-visiting-card', '/nfc-business-card-india'],
    cta: SHOP,
  },
  {
    path: '/instagram-nfc-card',
    title: 'Instagram NFC Card: Share Your Profile With a Tap | HuntsTAG',
    description:
      'Put your Instagram link on a HuntsTAG NFC card. One tap opens your profile page with an Instagram button, plus WhatsApp, portfolio and contact details.',
    h1: 'Instagram NFC card: let people find you in one tap',
    crumb: 'Instagram NFC card',
    lead: [
      'If your work lives on Instagram, a HuntsTAG NFC card puts it one tap away. Add your Instagram link to your profile, and anyone who taps your card can open it without searching for your handle.',
      'It works well for creators, photographers, makeup artists, designers and small brands that get customers through Instagram.',
    ],
    sections: [
      {
        h2: 'How it works',
        body: [
          'You add your Instagram link in your dashboard. The tap opens your HuntsTAG profile, which shows an Instagram button along with your other links. Tapping the button opens your Instagram page.',
          'The visitor does not need an app to open your HuntsTAG profile. Instagram opens in the Instagram app or the browser, as it normally would.',
        ],
      },
      {
        h2: 'Put everything in one place',
        body: [
          'Your profile can also show your WhatsApp number, contact details, a portfolio or website link, your address and a HuntsWorld listing link. One tap gives the visitor all of it, and they can save your contact to their phone.',
        ],
      },
      {
        h2: 'Change it when you need to',
        body: [
          'If you rename your account or move to a new link, update your profile in the dashboard. Your card keeps working because it opens your latest profile.',
        ],
      },
    ],
    faq: [
      { q: 'Can I add my Instagram to an NFC card?', a: 'Yes. Add your Instagram link to your HuntsTAG profile and it shows as a button on the page your card opens.' },
      { q: 'Does the card open Instagram directly?', a: 'The tap opens your HuntsTAG profile first. From there, one more tap on the Instagram button opens your Instagram page.' },
      { q: 'Can I add other social links too?', a: 'Your profile can show WhatsApp, a portfolio link and more. Open the card catalog to see what your plan includes.' },
      { q: 'Does it need an app?', a: 'No app is needed to open your HuntsTAG profile.' },
    ],
    related: ['/whatsapp-nfc-card', '/digital-visiting-card', '/nfc-business-card-india'],
    cta: SHOP,
  },
  {
    path: '/qr-and-nfc-visiting-card',
    title: 'QR and NFC Visiting Card: Tap or Scan to Share | HuntsTAG',
    description:
      'Every HuntsTAG card works two ways: tap it on an NFC phone or scan the QR code with any camera. Both open your profile. No app needed to view it.',
    h1: 'QR and NFC visiting card: two ways to share',
    crumb: 'QR and NFC visiting card',
    lead: [
      'Not every phone supports NFC. That is why every HuntsTAG card has both an NFC chip and a QR code. Both open the same profile, so you never have to worry about which phone the other person has.',
    ],
    sections: [
      {
        h2: 'Tap with NFC',
        body: [
          'Hold the card near the back of an NFC-enabled smartphone. The phone reads the chip and offers to open your profile. It takes about as long as picking up a phone.',
        ],
      },
      {
        h2: 'Scan with the camera',
        body: [
          'If the phone does not read NFC, or the person prefers not to tap, they can scan the QR code on the card with the phone camera. The same profile opens in the browser.',
        ],
      },
      {
        h2: 'One profile behind both',
        body: [
          'The tap and the QR code open the same HuntsTAG profile. You can show your contact details, WhatsApp, Instagram, portfolio link, address and HuntsWorld listing, and visitors can save your contact. You edit the profile online, and both the tap and the scan show the latest version.',
          'Neither method requires the person receiving it to install an app.',
        ],
      },
    ],
    faq: [
      { q: 'Does my card have a QR code as well as NFC?', a: 'Yes. Every HuntsTAG card comes with a built-in QR code along with the NFC chip.' },
      { q: 'Do the tap and the QR show the same page?', a: 'Yes. Both open your HuntsTAG profile.' },
      { q: 'Which phones support NFC?', a: 'Most recent smartphones do, but support depends on the phone and its settings. The QR code is the fallback for any phone with a camera.' },
      { q: 'Do I need to install an app to scan?', a: 'Most phone cameras scan QR codes directly. No HuntsTAG app is needed.' },
    ],
    related: ['/nfc-card-without-app', '/nfc-business-card-india', '/digital-visiting-card'],
    cta: SHOP,
  },
  {
    path: '/magic-poster',
    title: 'Magic Poster: A Video Poster You Scan to Play | HuntsTAG',
    description:
      'A HuntsTAG Magic Poster plays a video when someone scans it with their phone camera. No app to install. Learn how the video poster works.',
    h1: 'Magic Poster: scan a poster to play a video',
    crumb: 'Magic Poster',
    lead: [
      'A Magic Poster is a printed poster that comes alive on a phone. Point a phone camera at it, and a video plays on top of the poster. The person scanning does not install an app. It opens in the phone browser.',
      'It is a simple way to make a poster, flyer or display more interesting for the people who walk past it.',
    ],
    sections: [
      {
        h2: 'How a video poster works',
        body: [
          'Each Magic Poster is linked to a video. To see it, the visitor opens the Magic Camera page, allows the camera and points it at the poster. When the camera recognises the poster, the video plays over it, lined up with the artwork.',
          'You can try the effect on the Magic Poster page of this site, which shows the posters and a QR code that opens the camera.',
        ],
      },
      {
        h2: 'Scan with the camera, not with NFC',
        body: [
          'Some people search for an NFC poster. Our Magic Poster is different: it is recognised by the phone camera, not by an NFC chip. That means it works from a printed sheet or even a screen, and the person scanning needs no app.',
        ],
      },
      {
        h2: 'Where to use it',
        body: [
          'Magic Posters suit shop windows, events, product launches, classrooms and social media artwork. Anywhere you want a still image to tell a short video story, a scan can do it.',
          'You can see the available posters and order them from the Magic Poster page. All charges are shown at checkout.',
        ],
      },
    ],
    faq: [
      { q: 'What is a Magic Poster?', a: 'It is a printed poster that plays a video when it is scanned with a phone camera.' },
      { q: 'Does the person scanning need an app?', a: 'No. The scan opens in the phone browser, and the visitor allows camera access when asked.' },
      { q: 'Is a Magic Poster the same as an NFC poster?', a: 'No. A Magic Poster is recognised by the camera. It does not use an NFC chip.' },
      { q: 'How do I order one?', a: 'Open the Magic Poster page, choose a poster and add it to your cart. All charges are shown at checkout.' },
    ],
    related: ['/nfc-business-card-india', '/nfc-card-delivery-india'],
    cta: { label: 'See Magic Posters', to: '/magic-art' },
  },
  {
    path: '/nfc-card-delivery-india',
    title: 'NFC Card Delivery Across India | HuntsTAG',
    description:
      'HuntsTAG delivers NFC smart business cards and Magic Posters across India, including Mumbai, Delhi NCR, Bengaluru, Hyderabad, Chennai, Pune and Kolkata.',
    h1: 'NFC card delivery across India',
    crumb: 'NFC card delivery India',
    lead: [
      'HuntsTAG is an online store. You order from our website and we deliver your NFC smart business card or Magic Poster across India. You do not need to be in a particular city to order.',
    ],
    sections: [
      {
        h2: 'Cities our customers order from',
        body: [
          `We deliver across India, including ${CITIES}. Customers in other cities and towns can order the same way.`,
          'We do not run separate city stores. Every order is placed online, so the process is the same wherever you are.',
        ],
      },
      {
        h2: 'How ordering works',
        body: [
          'Choose a card plan in the shop and place your order. If you want a Magic Poster, pick it on the Magic Poster page and add it to your cart. Add your delivery address when you check out.',
          'All charges are shown at checkout, so you see the full amount before you pay.',
        ],
      },
      {
        h2: 'After your card arrives',
        body: [
          'Tap your card on an NFC-enabled phone or scan its QR code to check that your profile opens. You can edit your profile from your dashboard at any time, and you can track your order from the dashboard as well.',
        ],
      },
    ],
    faq: [
      { q: 'Do you deliver across India?', a: 'Yes. We deliver across India, including the major cities listed on this page and other towns.' },
      { q: 'Can I order from a city that is not listed?', a: 'Yes. The list shows places customers often order from. It is not a limit.' },
      { q: 'Where do I see the delivery charges?', a: 'All charges are shown at checkout before you pay.' },
      { q: 'Can I track my order?', a: 'You can follow your order from the track page in your dashboard.' },
    ],
    related: ['/nfc-business-card-india', '/magic-poster', '/digital-visiting-card'],
    cta: SHOP,
  },
  {
    path: '/nfc-card-kya-hai',
    lang: 'en-IN',
    title: 'NFC Card Kya Hai? Digital Visiting Card Kaise Banaye | HuntsTAG',
    description:
      'NFC card kya hai aur digital visiting card kaise banaye? HuntsTAG NFC card ek tap mein aapka number, WhatsApp aur portfolio share karta hai. App ki zarurat nahi.',
    h1: 'NFC card kya hai? Digital visiting card kaise banaye',
    crumb: 'NFC card kya hai',
    lead: [
      'NFC card ek aisa card hai jisme chhoti si NFC chip lagi hoti hai. Isse NFC wale smartphone par tap karte hi aapki online profile khul jaati hai. Samne wale ko koi app install nahi karna padta.',
      'Is page par seedhi bhasha mein samjhaya hai ki NFC card kya hota hai aur HuntsTAG ke saath digital visiting card kaise banaye.',
    ],
    sections: [
      {
        h2: 'NFC card kya hota hai',
        body: [
          'NFC ka matlab hai Near Field Communication. Card ko phone ke paas lane par phone chip ko padh leta hai aur ek link kholta hai. HuntsTAG card par ye link aapki online profile ka hota hai. Card par QR code bhi hota hai, to jis phone mein NFC nahi hai woh QR scan karke wahi profile khol sakta hai.',
        ],
      },
      {
        h2: 'Digital visiting card kaise banaye',
        body: [
          'Pehle HuntsTAG ki shop mein apna card plan chuniye aur order kijiye. Phir dashboard mein login karke apni profile bhariye: naam, phone number, WhatsApp, Instagram, portfolio link aur address. Card aane par use phone par tap karke ya QR scan karke check kijiye ki profile sahi khul rahi hai.',
          'Profile ko aap baad mein kabhi bhi dashboard se badal sakte hain. Naya card chhapwane ki zarurat nahi padti.',
        ],
      },
      {
        h2: 'Paper card se kya alag hai',
        body: [
          'Paper card mein jo likha hai wahi rehta hai. NFC card mein aapki profile online hoti hai, isliye number ya link badalne par card wahi rehta hai aur profile naye details dikhati hai. Samne wala ek tap mein aapka number apne phone ke contacts mein save bhi kar sakta hai.',
        ],
      },
      {
        h2: 'Order aur delivery',
        body: [
          `Hum poore India mein delivery karte hain, jaise ${CITIES}. Saare charges checkout par dikhaye jaate hain.`,
        ],
      },
    ],
    faq: [
      { q: 'NFC card kya hai?', a: 'Ye ek card hai jisme NFC chip hoti hai. Phone par tap karne se aapki online profile khul jaati hai.' },
      { q: 'Kya samne wale ko app chahiye?', a: 'Nahi. Tap ya QR scan karne par profile phone ke browser mein khul jaati hai.' },
      { q: 'Digital visiting card kaise banaye?', a: 'Shop se plan chuniye, order kijiye, phir dashboard mein apni profile bhariye. Card tap karte hi wahi profile khulti hai.' },
      { q: 'Kya baad mein details badal sakte hain?', a: 'Haan. Dashboard mein profile badaliye, card ab naye details dikhayega.' },
    ],
    related: ['/hi/digital-visiting-card', '/nfc-business-card-india', '/nfc-card-without-app'],
    cta: { label: 'Shop mein cards dekhein', to: '/shop' },
  },
  {
    path: '/hi/digital-visiting-card',
    lang: 'hi',
    title: 'डिजिटल विज़िटिंग कार्ड: NFC विज़िटिंग कार्ड | HuntsTAG',
    description:
      'HuntsTAG का NFC विज़िटिंग कार्ड एक टैप में आपका नंबर, WhatsApp और पोर्टफ़ोलियो शेयर करता है। सामने वाले को कोई ऐप इंस्टॉल नहीं करना पड़ता।',
    h1: 'डिजिटल विज़िटिंग कार्ड: एक टैप में अपनी जानकारी शेयर करें',
    crumb: 'डिजिटल विज़िटिंग कार्ड',
    lead: [
      'HuntsTAG का NFC विज़िटिंग कार्ड आपकी ऑनलाइन प्रोफ़ाइल से जुड़ा होता है। कार्ड को NFC वाले स्मार्टफ़ोन पर टैप करें, और आपका संपर्क नंबर, WhatsApp, पोर्टफ़ोलियो और सोशल लिंक सामने वाले की स्क्रीन पर खुल जाते हैं।',
      'सामने वाले को कोई ऐप इंस्टॉल करने की ज़रूरत नहीं होती।',
    ],
    sections: [
      {
        h2: 'डिजिटल विज़िटिंग कार्ड क्या है',
        body: [
          'डिजिटल विज़िटिंग कार्ड में आपकी जानकारी कागज़ पर छपने की जगह एक ऑनलाइन प्रोफ़ाइल में रहती है। HuntsTAG कार्ड में एक NFC चिप होती है, जो उसी प्रोफ़ाइल का लिंक खोलती है।',
          'कार्ड पर QR कोड भी होता है। जिस फ़ोन में NFC नहीं है, वह QR स्कैन करके वही प्रोफ़ाइल खोल सकता है।',
        ],
      },
      {
        h2: 'प्रोफ़ाइल में क्या दिख सकता है',
        body: [
          'आपकी प्रोफ़ाइल में संपर्क विवरण, WhatsApp नंबर, Instagram, पोर्टफ़ोलियो का लिंक, पता और HuntsWorld लिस्टिंग का लिंक दिख सकता है। सामने वाला एक टैप में आपका नंबर अपने फ़ोन के कॉन्टैक्ट्स में सेव कर सकता है।',
        ],
      },
      {
        h2: 'जानकारी बदलना आसान',
        body: [
          'अगर आपका नंबर या पोर्टफ़ोलियो बदल जाए, तो आप अपने डैशबोर्ड से प्रोफ़ाइल अपडेट कर सकते हैं। आपका कार्ड हमेशा नई प्रोफ़ाइल खोलता है, इसलिए नया कार्ड छपवाने की ज़रूरत नहीं पड़ती।',
        ],
      },
      {
        h2: 'ऑर्डर कैसे करें',
        body: [
          'शॉप में अपना प्लान चुनें और ऑर्डर करें। हम पूरे भारत में डिलीवरी करते हैं, जिसमें मुंबई, दिल्ली NCR, बेंगलुरु, हैदराबाद, चेन्नई, पुणे, कोलकाता, अहमदाबाद और जयपुर शामिल हैं। सभी शुल्क चेकआउट पर दिखाए जाते हैं।',
        ],
      },
    ],
    faq: [
      { q: 'डिजिटल विज़िटिंग कार्ड क्या होता है?', a: 'यह एक ऐसा कार्ड है जो टैप करने पर आपकी ऑनलाइन प्रोफ़ाइल खोलता है, जिसमें आपका नंबर और लिंक होते हैं।' },
      { q: 'क्या सामने वाले को ऐप चाहिए?', a: 'नहीं। टैप या QR स्कैन करने पर प्रोफ़ाइल फ़ोन के ब्राउज़र में खुल जाती है।' },
      { q: 'अगर फ़ोन में NFC न हो तो?', a: 'कार्ड पर QR कोड होता है। उसे फ़ोन के कैमरे से स्कैन करने पर वही प्रोफ़ाइल खुल जाती है।' },
      { q: 'क्या बाद में जानकारी बदल सकते हैं?', a: 'हाँ। डैशबोर्ड में प्रोफ़ाइल बदलें, कार्ड नई जानकारी दिखाएगा।' },
    ],
    related: ['/nfc-card-kya-hai', '/digital-visiting-card', '/nfc-business-card-india'],
    cta: { label: 'शॉप में कार्ड देखें', to: '/shop' },
  },
];

export const LANDING_BY_PATH = Object.fromEntries(LANDING_PAGES.map((p) => [p.path, p]));
