package com.caelan.mptree;

import androidx.annotation.NonNull;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Google Play Billing for MPTree Pro, a one-time in-app product.
 *
 * Play is the only record of who bought what. There is no MPTree server, so
 * nothing here verifies a purchase anywhere else: Play's own client tells us,
 * and Play's cache answers even offline. JS (src/pro.ts) remembers the answer
 * too, so Pro survives a phone that cannot reach Play at all.
 *
 * Every purchase is acknowledged. Play refunds one that is not acknowledged
 * within three days, which would take Pro away from someone who paid.
 */
@CapacitorPlugin(name = "Billing")
public class BillingPlugin extends Plugin {

    private BillingClient client;
    /** The purchase() call waiting for Play's purchase sheet to finish. */
    private PluginCall pendingPurchase;
    private String pendingProduct;

    private final PurchasesUpdatedListener onPurchases = (result, purchases) -> {
        PluginCall call = pendingPurchase;
        String product = pendingProduct;
        pendingPurchase = null;
        pendingProduct = null;

        int code = result.getResponseCode();
        if (code == BillingClient.BillingResponseCode.OK && purchases != null) {
            boolean owned = false, pending = false;
            for (Purchase p : purchases) {
                if (product != null && !p.getProducts().contains(product)) continue;
                if (p.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
                    owned = true;
                    acknowledge(p);
                } else if (p.getPurchaseState() == Purchase.PurchaseState.PENDING) {
                    pending = true;
                }
            }
            if (call != null) {
                JSObject r = new JSObject();
                r.put("owned", owned);
                r.put("pending", pending && !owned);
                call.resolve(r);
            }
        } else if (code == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED && call != null) {
            JSObject r = new JSObject();
            r.put("owned", true);
            call.resolve(r);
        } else if (code == BillingClient.BillingResponseCode.USER_CANCELED && call != null) {
            JSObject r = new JSObject();
            r.put("owned", false);
            r.put("cancelled", true);
            call.resolve(r);
        } else if (call != null) {
            call.reject("Purchase failed: " + result.getDebugMessage(), String.valueOf(code));
        }
    };

    @Override
    public void load() {
        client = BillingClient.newBuilder(getContext())
                .setListener(onPurchases)
                .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
                .enableAutoServiceReconnection()
                .build();
    }

    /** Runs `then` once Play's billing service is connected, or rejects `call`. */
    private void whenReady(PluginCall call, Runnable then) {
        if (client.isReady()) { then.run(); return; }
        client.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(@NonNull BillingResult result) {
                if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) then.run();
                else call.reject("Google Play is not available: " + result.getDebugMessage(),
                        String.valueOf(result.getResponseCode()));
            }

            @Override
            public void onBillingServiceDisconnected() {
                // enableAutoServiceReconnection reconnects on the next call.
            }
        });
    }

    private void productDetails(PluginCall call, String productId, java.util.function.Consumer<ProductDetails> then) {
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
                .setProductList(Collections.singletonList(
                        QueryProductDetailsParams.Product.newBuilder()
                                .setProductId(productId)
                                .setProductType(BillingClient.ProductType.INAPP)
                                .build()))
                .build();
        client.queryProductDetailsAsync(params, (result, details) -> {
            List<ProductDetails> list = details.getProductDetailsList();
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK || list.isEmpty()) {
                call.reject("Product not found: " + productId, String.valueOf(result.getResponseCode()));
                return;
            }
            then.accept(list.get(0));
        });
    }

    @PluginMethod
    public void getProduct(PluginCall call) {
        String productId = call.getString("productId");
        if (productId == null) { call.reject("productId is required"); return; }
        whenReady(call, () -> productDetails(call, productId, pd -> {
            JSObject r = new JSObject();
            ProductDetails.OneTimePurchaseOfferDetails offer = pd.getOneTimePurchaseOfferDetails();
            r.put("price", offer != null ? offer.getFormattedPrice() : "");
            call.resolve(r);
        }));
    }

    @PluginMethod
    public void purchase(PluginCall call) {
        String productId = call.getString("productId");
        if (productId == null) { call.reject("productId is required"); return; }
        if (pendingPurchase != null) { call.reject("A purchase is already open"); return; }
        whenReady(call, () -> productDetails(call, productId, pd -> {
            List<BillingFlowParams.ProductDetailsParams> items = new ArrayList<>();
            items.add(BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(pd).build());
            BillingFlowParams flow = BillingFlowParams.newBuilder().setProductDetailsParamsList(items).build();
            getActivity().runOnUiThread(() -> {
                pendingPurchase = call;
                pendingProduct = productId;
                BillingResult launched = client.launchBillingFlow(getActivity(), flow);
                if (launched.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    // The sheet never opened, so the listener will not be called.
                    pendingPurchase = null;
                    pendingProduct = null;
                    if (launched.getResponseCode() == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) {
                        JSObject r = new JSObject();
                        r.put("owned", true);
                        call.resolve(r);
                    } else {
                        call.reject("Could not open Google Play: " + launched.getDebugMessage(),
                                String.valueOf(launched.getResponseCode()));
                    }
                }
            });
        }));
    }

    @PluginMethod
    public void restore(PluginCall call) {
        String productId = call.getString("productId");
        if (productId == null) { call.reject("productId is required"); return; }
        if (!client.isReady()) {
            // Offline or no Play Store: say so rather than "not owned", so JS
            // keeps what it remembers.
            client.startConnection(new BillingClientStateListener() {
                @Override
                public void onBillingSetupFinished(@NonNull BillingResult result) {
                    if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) queryOwned(call, productId);
                    else notReachable(call);
                }

                @Override
                public void onBillingServiceDisconnected() { }
            });
            return;
        }
        queryOwned(call, productId);
    }

    private void notReachable(PluginCall call) {
        JSObject r = new JSObject();
        r.put("ok", false);
        r.put("owned", false);
        call.resolve(r);
    }

    private void queryOwned(PluginCall call, String productId) {
        QueryPurchasesParams params = QueryPurchasesParams.newBuilder()
                .setProductType(BillingClient.ProductType.INAPP)
                .build();
        client.queryPurchasesAsync(params, (result, purchases) -> {
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) { notReachable(call); return; }
            boolean owned = false;
            for (Purchase p : purchases) {
                if (!p.getProducts().contains(productId)) continue;
                if (p.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
                    owned = true;
                    acknowledge(p);
                }
            }
            JSObject r = new JSObject();
            r.put("ok", true);
            r.put("owned", owned);
            call.resolve(r);
        });
    }

    private void acknowledge(Purchase p) {
        if (p.isAcknowledged()) return;
        client.acknowledgePurchase(
                AcknowledgePurchaseParams.newBuilder().setPurchaseToken(p.getPurchaseToken()).build(),
                r -> { /* Retried on the next restore() if this one failed. */ });
    }
}
