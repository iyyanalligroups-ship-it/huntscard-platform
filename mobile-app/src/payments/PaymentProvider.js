import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme/colors.js';

// Razorpay Standard Checkout, hosted inside a WebView. Same flow the website
// runs in loadRazorpayScript()/runCheckout(): the backend creates the order,
// checkout.js collects the payment, and the signed response goes back to the
// backend's confirm endpoint -- so verification stays server-side and
// identical to the web.
const PaymentContext = createContext(null);

const safeJson = (value) => JSON.stringify(value).split(String.fromCharCode(60)).join(String.fromCharCode(92) + "u003c");

function buildHtml(options) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>html,body{margin:0;height:100%;background:#f4f7fd;color:#55627a;font-family:sans-serif;display:flex;align-items:center;justify-content:center}</style></head>
<body><p id="msg">Opening secure payment…</p>
<script>
  function post(m){ window.ReactNativeWebView.postMessage(JSON.stringify(m)); }
  window.onerror = function(e){ post({type:'error', message:String(e)}); };
</script>
<script src="https://checkout.razorpay.com/v1/checkout.js" onerror="post({type:'error',message:'Could not load the payment window. Check your connection and try again.'})"></script>
<script>
  window.addEventListener('load', function(){
    if (!window.Razorpay) { post({type:'error', message:'Could not load the payment window. Check your connection and try again.'}); return; }
    var options = ${safeJson(options)};
    options.handler = function(response){ post({type:'success', response: response}); };
    options.modal = { ondismiss: function(){ post({type:'dismiss'}); }, escape: false };
    var rzp = new Razorpay(options);
    rzp.on('payment.failed', function(resp){ post({type:'failed', message: resp && resp.error && resp.error.description}); });
    rzp.open();
  });
</script></body></html>`;
}

export function PaymentProvider({ children }) {
  const [session, setSession] = useState(null);
  const settle = useRef(null);

  const pay = useCallback(({ order, description, prefill }) => new Promise((resolve, reject) => {
    settle.current = { resolve, reject };
    setSession({
      html: buildHtml({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.orderId,
        name: 'HuntsTAG',
        description,
        prefill,
        theme: { color: '#8b5cf6' },
      }),
    });
  }), []);

  const finish = useCallback((error, response) => {
    const pending = settle.current;
    settle.current = null;
    setSession(null);
    if (!pending) return;
    if (error) pending.reject(error);
    else pending.resolve(response);
  }, []);

  const onMessage = useCallback((event) => {
    let message;
    try { message = JSON.parse(event.nativeEvent.data); } catch { return; }
    if (message.type === 'success') finish(null, message.response);
    else if (message.type === 'dismiss') finish(new Error('Payment cancelled.'));
    else if (message.type === 'failed') finish(new Error(message.message || 'Payment failed.'));
    else if (message.type === 'error') finish(new Error(message.message || 'Payment failed.'));
  }, [finish]);

  const value = useMemo(() => ({ pay }), [pay]);

  return (
    <PaymentContext.Provider value={value}>
      {children}
      <Modal visible={Boolean(session)} animationType="slide" onRequestClose={() => finish(new Error('Payment cancelled.'))}>
        <SafeAreaView style={styles.root}>
          <View style={styles.bar}>
            <Text style={styles.barTitle}>Secure payment</Text>
            <Pressable onPress={() => finish(new Error('Payment cancelled.'))} hitSlop={10}><Text style={styles.cancel}>Cancel</Text></Pressable>
          </View>
          {session ? (
            <WebView
              originWhitelist={['*']}
              source={{ html: session.html, baseUrl: 'https://checkout.razorpay.com/' }}
              onMessage={onMessage}
              javaScriptEnabled
              domStorageEnabled
              setSupportMultipleWindows={false}
              startInLoadingState
              renderLoading={() => <View style={styles.loading}><ActivityIndicator color={colors.holoCyan} /></View>}
              // UPI / banking apps register custom schemes (upi://, intent://, gpay://...) --
              // WebView can't open those itself, so hand them to the OS.
              onShouldStartLoadWithRequest={(request) => {
                if (/^(https?:|about:|data:|blob:)/i.test(request.url)) return true;
                Linking.openURL(request.url).catch(() => {});
                return false;
              }}
              style={{ flex: 1, backgroundColor: colors.space }}
            />
          ) : null}
        </SafeAreaView>
      </Modal>
    </PaymentContext.Provider>
  );
}

export function usePayment() {
  return useContext(PaymentContext);
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.space },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: colors.panelBorder },
  barTitle: { color: colors.text, fontWeight: '800', fontSize: 16 },
  cancel: { color: colors.danger, fontWeight: '700' },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.space },
});
