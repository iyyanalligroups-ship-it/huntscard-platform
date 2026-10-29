// Text of the Privacy Policy and Terms & Conditions. The mobile app keeps an identical copy at
// mobile-app/src/lib/legalContent.js -- change both together.
//
// Shape: { title, updated, intro, sections: [{ h, p: [paragraphs], ul: [bullets], subs: [{ h, p, ul }] }] }

export const SUPPORT_EMAIL = 'info@huntsworld.com';
export const LEGAL_UPDATED = '29 October 2026';

export const PRIVACY = {
  title: 'Privacy Policy',
  updated: LEGAL_UPDATED,
  intro:
    'HuntsTAG makes smart NFC business cards and the website and mobile app that go with them. This policy explains what information we collect when you use HuntsTAG, how we use it, who we share it with, and the choices you have. By creating an account or using HuntsTAG you agree to this policy.',
  sections: [
    {
      h: '1. Information We Collect',
      subs: [
        {
          h: '1.1 Information you give us',
          ul: [
            'Account details: full name, mobile number, email address, password (stored only as a one-way hash), and optionally gender and date of birth.',
            'Card profile: job title, bio, highlights, profile photo, banner, logo, public email, phone and WhatsApp number, and links to your social and portfolio pages. This is what other people see when they tap or scan your card.',
            'Contacts and appointments: contacts you add by hand, import from your phone or upload from a spreadsheet, and appointment requests you send or receive.',
            'Orders: the card plan and design you choose, artwork you upload, delivery addresses, and order and shipment details.',
            'Support: messages you send through chat support or the contact form.',
            'AR and media: images, videos and 3D models you upload for your AR experience.',
          ],
        },
        {
          h: '1.2 Information collected automatically',
          ul: [
            'Card taps: a count of how many times your card or public profile was opened.',
            'Device and usage data: browser or device type, IP address, pages visited and error logs, used to keep the service running and secure.',
            'Notification tokens: if you allow notifications, an identifier that lets us send them to your browser or device.',
          ],
        },
        {
          h: '1.3 Information from other services',
          ul: [
            'Payments: Razorpay tells us whether a payment succeeded and its reference number. We never see or store your full card, UPI or bank details.',
            'Messaging providers: delivery status for one-time passwords and notifications we send you by SMS or email.',
          ],
        },
        {
          h: '1.4 Permissions in the mobile app',
          p: ['The app only asks for access when you use a feature that needs it. You can change these in your phone settings at any time.'],
          ul: [
            'Contacts: to import contacts from your phone, or to save someone’s card into your address book.',
            'Camera: to scan QR codes and to use the AR camera.',
            'Photos and files: to choose a profile photo, artwork, media or a spreadsheet to upload.',
            'Notifications: to tell you about appointment requests and card taps.',
            'NFC: to read and write HuntsTAG cards.',
          ],
        },
      ],
    },
    {
      h: '2. How We Use Your Information',
      ul: [
        'To create and run your account and your public card profile.',
        'To process orders, take payments, make and ship your card, and issue invoices.',
        'To send one-time passwords, password-reset codes, order updates and appointment notifications.',
        'To back up and restore your contacts and to deliver features such as appointments, chat support and AR.',
        'To answer your questions and provide support.',
        'To keep HuntsTAG secure, prevent fraud and abuse, and fix problems.',
        'To meet our legal and tax obligations.',
      ],
    },
    {
      h: '3. What Other People Can See',
      p: [
        'Your card profile is public by design. Anyone who taps, scans or opens your card link can see the details you have chosen to put on it, such as your name, photo, job title, bio, public contact details and links. Do not add anything to your profile that you do not want others to see.',
        'Your account email, date of birth, gender, saved contacts, orders and messages are private and are not shown on your public profile.',
        'If a visitor uses “Exchange Contact”, the details they type are saved to your contacts list. You can pause your card at any time from your dashboard to hide your public profile.',
      ],
    },
    {
      h: '4. Who We Share Information With',
      p: ['We do not sell your personal information. We share it only as follows:'],
      ul: [
        'Service providers who work for us: payment processing (Razorpay), SMS and email delivery, hosting and storage, and delivery couriers who need your name, phone number and address to deliver an order.',
        'Other HuntsWorld services, only where you choose to link or claim something, such as a HuntsWorld listing or coupon.',
        'Authorities, when the law requires it or to protect the rights, safety and security of our users and of HuntsTAG.',
        'A successor, if HuntsTAG is merged with or acquired by another business, with the same protections for your information.',
      ],
    },
    {
      h: '5. Data Security',
      p: [
        'We protect your information with measures such as hashed passwords, signed login tokens, access controls on our admin tools, and encrypted connections. No system is completely secure, so please use a strong, unique password and keep it private. If you think your account has been accessed without your permission, change your password and contact us.',
      ],
    },
    {
      h: '6. Data Retention',
      p: [
        'We keep your information while your account is active and as long as needed to provide the service. We keep order and invoice records for as long as tax and accounting laws require. When you ask us to delete your account we remove or anonymise your personal information, except what we must keep by law or to resolve disputes.',
      ],
    },
    {
      h: '7. Your Choices and Rights',
      ul: [
        'View and edit your profile and account details from your dashboard.',
        'Add, edit, export or delete your saved contacts.',
        'Pause or unpause a card to control whether your public profile is visible.',
        'Turn off notifications in your browser or phone settings.',
        'Ask us to give you a copy of your data, correct it, or delete your account by contacting us through the Contact Us page or chat support.',
      ],
    },
    {
      h: '8. Cookies and Local Storage',
      p: [
        'HuntsTAG uses your browser’s local storage, and secure storage on your phone, to keep you signed in and to remember simple preferences. We do not use this to show you third-party advertising.',
        'Our website uses Google Analytics, which sets cookies to count visits and see which pages are used. It receives the pages you view, your device and browser details and your approximate location, and we do not send it your name, phone number or email. The mobile app does not use Google Analytics.',
      ],
    },
    {
      h: '9. Children',
      p: [
        'HuntsTAG is meant for people aged 18 and over. We do not knowingly collect information from children. If you believe a child has given us personal information, contact us and we will delete it.',
      ],
    },
    {
      h: '10. Where Your Information Is Processed',
      p: [
        'Your information may be processed and stored on servers and by service providers located outside your own state or country. Wherever it is processed, we take steps to protect it as described in this policy.',
      ],
    },
    {
      h: '11. Changes to This Policy',
      p: [
        'We may update this policy from time to time. We will change the “last updated” date above and, for important changes, tell you in the app or by email. Continuing to use HuntsTAG after a change means you accept the updated policy.',
      ],
    },
  ],
};

export const TERMS = {
  title: 'Terms and Conditions',
  updated: LEGAL_UPDATED,
  intro:
    'These terms are an agreement between you and HuntsTAG. They apply to our website, mobile app, NFC cards and related services. Please read them carefully. By creating an account, placing an order or using HuntsTAG you accept these terms and our Privacy Policy.',
  sections: [
    {
      h: '1. About HuntsTAG',
      p: [
        'HuntsTAG provides smart business cards that share your profile when tapped or scanned, a dashboard and app to manage your profile and contacts, augmented reality (AR) features, Magic Poster products, and support tools.',
        'You must be at least 18 years old, and able to enter a binding contract, to use HuntsTAG.',
      ],
    },
    {
      h: '2. Definitions',
      ul: [
        '“We”, “us” and “HuntsTAG” mean the operator of the HuntsTAG website, app and services.',
        '“You” means the person who creates an account or uses HuntsTAG.',
        '“Card” means a physical HuntsTAG NFC card or similar product.',
        '“Profile” means the public page linked to your card.',
        '“Content” means anything you upload or enter, such as text, photos, videos, 3D models, contacts and messages.',
      ],
    },
    {
      h: '3. Your Account',
      subs: [
        {
          h: '3.1 Creating an account',
          p: ['Give us accurate and current information, and keep it up to date. One account is for one person or business. You may not create an account using someone else’s identity.'],
        },
        {
          h: '3.2 Keeping it secure',
          p: ['You are responsible for your password and for everything done through your account. Tell us straight away if you suspect it has been misused. We may ask you to change your password at first login.'],
        },
      ],
    },
    {
      h: '4. Your Content and Public Profile',
      p: [
        'You own your Content. You give us a licence to store, display and transmit it as needed to run HuntsTAG, including showing your profile to anyone who taps or scans your card.',
        'You promise that you have the right to use your Content and that it does not break any law or anyone’s rights. You are responsible for what is on your profile, because it is visible to the public.',
      ],
    },
    {
      h: '5. Acceptable Use',
      p: ['You agree not to:'],
      ul: [
        'put unlawful, misleading, hateful, harassing, obscene or infringing material on your profile or send it through the service;',
        'pretend to be another person or business;',
        'upload contacts or personal information of other people without a right to do so, or use the service to send spam;',
        'try to access other accounts, probe or disrupt our systems, or bypass security or limits;',
        'copy, reverse engineer or resell the service, our software or our designs, except as the law allows;',
        'use the service for any unlawful purpose.',
      ],
    },
    {
      h: '6. Orders, Prices and Payment',
      ul: [
        'Prices are shown in Indian Rupees and may include taxes as shown at checkout. A GST invoice is available for paid orders.',
        'Payments are processed by Razorpay. We do not store your card, UPI or bank details.',
        'An order is confirmed only after payment succeeds. We may refuse or cancel an order, for example because of a pricing error, stock problem or suspected fraud, and will refund any payment taken for it.',
        'We may change prices and plans from time to time. A change does not affect an order you have already paid for.',
      ],
    },
    {
      h: '7. Production and Delivery',
      p: [
        'Cards are made after payment, and custom designs are printed from the artwork you supply. Check your design, name and details before you pay; we print what you submit.',
        'Delivery times shown are estimates. You can follow your order in the Track section using the tracking ID. Risk in the card passes to you on delivery.',
        'Please give a complete and correct delivery address. We are not responsible for delay or loss caused by an incorrect address.',
      ],
    },
    {
      h: '8. Cancellations, Returns and Refunds',
      ul: [
        'You can ask to cancel an order before it goes into production and receive a full refund of the amount paid.',
        'Once a card is made, especially with a custom design or personal details, it cannot be cancelled or returned unless it arrives damaged, defective or not as ordered.',
        'If your card arrives damaged or defective, tell us within 7 days of delivery with photos, and we will repair, replace or refund it.',
        'Approved refunds go back to your original payment method and may take several business days to show.',
      ],
    },
    {
      h: '9. Lost, Stolen or Paused Cards',
      p: [
        'If you lose a card, pause it from your dashboard so your public profile stops being shown. You are responsible for what happens until you pause it. A replacement is a new order.',
      ],
    },
    {
      h: '10. AR, Magic Camera and Magic Posters',
      p: [
        'AR and Magic Camera features depend on your device, camera and connection and may not work on every phone. Do not use them while driving, walking in traffic or in any unsafe place.',
        'Digital media, AR content and Magic Poster designs shown through HuntsTAG belong to us or our licensors and are for your personal or business-card use only.',
      ],
    },
    {
      h: '11. Contacts, Appointments and Messages',
      p: [
        'You may back up your contacts and send appointment requests. You are responsible for having a right to use the contact details you save or message. When you send an appointment request to a number that has no account, we may send that person an SMS invitation on your behalf.',
      ],
    },
    {
      h: '12. Intellectual Property',
      p: [
        'HuntsTAG, its logo, designs, software and website content belong to us or our licensors. These terms do not give you any ownership of them. You may not use our name or logo without our written permission.',
      ],
    },
    {
      h: '13. Third-Party Services',
      p: [
        'HuntsTAG works with other services, such as Razorpay for payments, SMS and email providers, couriers, and HuntsWorld. They have their own terms and privacy policies, and we are not responsible for their services.',
      ],
    },
    {
      h: '14. Privacy and Data Protection',
      p: ['How we collect and use personal information is explained in our Privacy Policy, which is part of these terms.'],
    },
    {
      h: '15. Availability and Changes to the Service',
      p: [
        'We work to keep HuntsTAG available but cannot promise it will always be uninterrupted or error free. We may update, change or stop features, with notice where reasonable.',
      ],
    },
    {
      h: '16. Suspension and Termination',
      p: [
        'You can stop using HuntsTAG at any time and ask us to delete your account. We may suspend or close an account, or block a card’s public profile, if you break these terms, misuse the service, or we are required to by law. Terms that by their nature should continue after that, such as those on intellectual property, liability and disputes, will continue.',
      ],
    },
    {
      h: '17. Disclaimers and Limit of Liability',
      p: [
        'HuntsTAG is provided “as is” and “as available”. To the fullest extent the law allows, we do not give any warranty that the service will meet your needs or be error free, and we are not liable for indirect or consequential loss, loss of business, profit, data or goodwill.',
        'Our total liability to you for any claim about the service or an order is limited to the amount you paid us for the order or service the claim is about. Nothing in these terms limits liability that cannot be limited by law.',
      ],
    },
    {
      h: '18. Governing Law and Disputes',
      p: [
        'These terms are governed by the laws of India. We encourage you to contact us first so we can try to resolve any complaint informally. If we cannot, the courts of India having jurisdiction over our registered office will have jurisdiction, subject to any rights you have as a consumer under the law.',
      ],
    },
    {
      h: '19. Grievances',
      p: [
        'If you have a complaint about the service, your account or content on HuntsTAG, contact us through the Contact Us page or chat support with your account details and a description of the problem. We will acknowledge your complaint and aim to resolve it within a reasonable time.',
      ],
    },
    {
      h: '20. Changes to These Terms',
      p: [
        'We may update these terms from time to time. We will change the “last updated” date and, for important changes, tell you in the app or by email. Using HuntsTAG after a change means you accept the updated terms.',
      ],
    },
    {
      h: '21. General',
      p: [
        'If any part of these terms is found unenforceable, the rest stays in effect. If we do not enforce a term, that does not mean we give it up. These terms and the Privacy Policy are the whole agreement between you and us about HuntsTAG.',
      ],
    },
  ],
};
