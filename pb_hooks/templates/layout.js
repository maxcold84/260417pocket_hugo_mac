module.exports = `
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BMW Shop</title>
    <!-- Tailwind CSS V4 Alpha CDN implementation -->
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        bmw: {
                            blue: '#1C69D4',
                            dark: '#111111',
                            surface: '#1A1A1A',
                            border: '#333333'
                        }
                    }
                }
            }
        }
    </script>
    <style>
        body { 
            background-color: #111111; 
            color: #FFFFFF; 
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; 
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        }
    </style>
    <!-- HTMX -->
    <script src="https://unpkg.com/htmx.org@2.0.0"></script>
    <!-- Alpine.js -->
    <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
    <!-- PortOne V2 Browser SDK -->
    <script src="https://cdn.portone.io/v2/browser-sdk.js"></script>
</head>
<body class="bg-bmw-dark text-white min-h-screen flex flex-col">
    <nav class="bg-black/90 backdrop-blur-md sticky top-0 z-50 border-b border-bmw-border" x-data="{ loggedIn: document.cookie.includes('pb_auth='), cartOpen: false }" @open-cart.window="cartOpen = true; fetch('/cart/view').then(r=>r.text()).then(html => $refs.cartContent.innerHTML = html)">
        <div class="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
            <a href="/" class="text-xl font-bold tracking-widest text-white hover:text-bmw-blue transition duration-300">
                BMW SHOP
            </a>
            <div class="flex items-center gap-6 text-sm font-medium text-gray-400">
                <a href="/" class="hover:text-white transition">CATALOG</a>
                <a href="#" @click.prevent="cartOpen = true; fetch('/cart/view').then(r=>r.text()).then(html => $refs.cartContent.innerHTML = html)" class="hover:text-white transition">CART</a>
                <a href="/my-orders" class="hover:text-white transition">ORDERS</a>
                
                <template x-if="!loggedIn">
                    <a href="/login" class="hover:text-white transition">LOGIN</a>
                </template>
                <template x-if="loggedIn">
                    <button @click="document.cookie = 'pb_auth=; Max-Age=0; path=/'; window.location.href='/';" class="hover:text-white transition uppercase tracking-widest text-gray-400">LOGOUT</button>
                </template>
            </div>
        </div>

        <!-- Sidebar Cart Modal -->
        <template x-teleport="body">
            <div x-show="cartOpen" class="fixed inset-0 z-[100] flex justify-end" style="display: none;">
                <!-- Backdrop -->
                <div x-show="cartOpen" x-transition.opacity class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="cartOpen = false"></div>
                
                <!-- Sidebar -->
                <div x-show="cartOpen" 
                     x-transition:enter="transition ease-out duration-300"
                     x-transition:enter-start="translate-x-full"
                     x-transition:enter-end="translate-x-0"
                     x-transition:leave="transition ease-in duration-300"
                     x-transition:leave-start="translate-x-0"
                     x-transition:leave-end="translate-x-full"
                     class="relative w-full max-w-md bg-bmw-dark shadow-2xl h-full flex flex-col border-l border-bmw-border relative">
                    
                    <div class="flex items-center justify-between p-6 border-b border-bmw-border">
                        <h2 class="text-xl font-light tracking-widest text-white">YOUR CART</h2>
                        <button @click="cartOpen = false" class="text-gray-400 hover:text-white text-3xl leading-none font-light">&times;</button>
                    </div>

                    <div x-ref="cartContent" class="flex-1 overflow-hidden p-6 relative">
                        <div class="flex items-center justify-center h-full text-gray-500">
                            Loading cart...
                        </div>
                    </div>
                </div>
            </div>
        </template>
    </nav>
    <main class="max-w-7xl mx-auto px-4 py-12 flex-1 w-full">
        {{slot}}
    </main>
    <footer class="bg-black border-t border-bmw-border py-8 text-center text-xs text-gray-500">
        <p>&copy; 2026 BMW eCommerce Example.</p>
    </footer>
</body>
</html>
`;
