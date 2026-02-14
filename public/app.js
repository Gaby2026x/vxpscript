const app = {
    token: null,
    charts: { human: null, bot: null, hourly: null },
    ws: null,
    wsReconnectAttempts: 0,
    wsMaxReconnectAttempts: 10,
    wsReconnectDelay: 1000,
    links: [],
    domains: [],
    shortLinks: [],
    templates: [],
    ui: {},
    user: null,
    feedEventCount: 0,
    totalHumanClicks: 0,
    totalBotClicks: 0,

    init() {
        this.populateUiElements();
        this.addEventListeners();
        this.checkInitialAuth();
    },

    populateUiElements() {
        this.ui = {
            authSection: document.getElementById('auth-section'),
            adminLoginForm: document.getElementById('admin-login-form'),
            adminEmailInput: document.getElementById('admin-email-input'),
            adminLoginError: document.getElementById('admin-login-error'),
            adminTabBtn: document.getElementById('admin-tab-btn'),
            accessTabBtn: document.getElementById('access-tab-btn'),
            loginForm: document.getElementById('login-form'),
            loginAccessKey: document.getElementById('login-access-key'),
            loginError: document.getElementById('login-error'),
            panel: document.getElementById('panel'),
            nav: document.getElementById('sidebar'),
            usernameDisplay: document.getElementById('username-display'),
            userRoleDisplay: document.getElementById('user-role-display'),
            userAvatar: document.getElementById('user-avatar'),
            navLinks: document.querySelectorAll('.nav-link'),
            contentSections: document.querySelectorAll('.content-section'),
            createLinkForm: document.getElementById('create-link-form'),
            destinationsContainer: document.getElementById('destinations-container'),
            addDestinationBtn: document.getElementById('add-destination-btn'),
            licenseKeyInput: document.getElementById('license-key-input'),
            expiresAtInput: document.getElementById('expires-at-input'),
            customDomainSelect: document.getElementById('custom-domain-select'),
            createError: document.getElementById('create-error'),
            resultSection: document.getElementById('result-section'),
            resultUrl: document.getElementById('result-url'),
            copyResultBtn: document.getElementById('copy-result-btn'),
            createAnotherBtn: document.getElementById('create-another-btn'),
            linksTbody: document.getElementById('links-tbody'),
            noLinksMessage: document.getElementById('no-links'),
            humanClicksChartCanvas: document.getElementById('humanClicksChart'),
            botClicksChartCanvas: document.getElementById('botClicksChart'),
            addDomainForm: document.getElementById('add-domain-form'),
            domainInput: document.getElementById('domain-input'),
            domainError: document.getElementById('domain-error'),
            domainsTbody: document.getElementById('domains-tbody'),
            noDomainsMessage: document.getElementById('no-domains'),
            cnameTarget: document.getElementById('cname-target'),
            cnameTargetDomains: document.getElementById('cname-target-domains'),
            createShortLinkForm: document.getElementById('create-short-link-form'),
            shortLinkUrl: document.getElementById('short-link-url'),
            shortLinkAlias: document.getElementById('short-link-alias'),
            shortLinkTitle: document.getElementById('short-link-title'),
            shortLinkError: document.getElementById('short-link-error'),
            shortLinkResult: document.getElementById('short-link-result'),
            shortLinkResultUrl: document.getElementById('short-link-result-url'),
            copyShortLinkBtn: document.getElementById('copy-short-link-btn'),
            shortLinksTbody: document.getElementById('short-links-tbody'),
            noShortLinksMessage: document.getElementById('no-short-links'),
            shortLinksTotal: document.getElementById('short-links-total'),
            shortLinksClicks: document.getElementById('short-links-clicks'),
            totalShortLinks: document.getElementById('total-short-links'),
            templateForm: document.getElementById('template-form'),
            templateName: document.getElementById('template-name'),
            templateDescription: document.getElementById('template-description'),
            templateHtml: document.getElementById('template-html'),
            templateIsDefault: document.getElementById('template-is-default'),
            templateError: document.getElementById('template-error'),
            templateValidationResult: document.getElementById('template-validation-result'),
            validateTemplateBtn: document.getElementById('validate-template-btn'),
            previewTemplateBtn: document.getElementById('preview-template-btn'),
            loadDefaultTemplateBtn: document.getElementById('load-default-template-btn'),
            tokenList: document.getElementById('token-list'),
            templatesTbody: document.getElementById('templates-tbody'),
            noTemplatesMessage: document.getElementById('no-templates'),
            templatePreviewModal: document.getElementById('template-preview-modal'),
            templatePreviewClose: document.getElementById('template-preview-close'),
            templatePreviewIframe: document.getElementById('template-preview-iframe'),
            menuBtn: document.getElementById('menu-btn'),
            sidebarOverlay: document.getElementById('sidebar-overlay'),
            logoutBtn: document.getElementById('logout-btn'),
            analyticsModal: document.getElementById('analytics-modal-overlay'),
            analyticsContent: document.getElementById('analytics-modal-body'),
            closeModalBtn: document.getElementById('analytics-modal-close'),
            liveFeedSection: document.getElementById('live-feed-section'),
            clearFeedBtn: document.getElementById('clear-feed-btn'),
            wsStatus: document.getElementById('ws-status'),
            wsStatusNav: document.getElementById('ws-status-nav'),
            liveIndicator: document.getElementById('live-indicator'),
            feedCount: document.getElementById('feed-count'),
            totalHumanClicks: document.getElementById('total-human-clicks'),
            totalBotClicks: document.getElementById('total-bot-clicks'),
            totalLinks: document.getElementById('total-links'),
            toastContainer: document.getElementById('toast-container'),
            adminNavItem: document.getElementById('admin-nav-item'),
            generateKeyForm: document.getElementById('generate-key-form'),
            targetEmail: document.getElementById('target-email'),
            generateKeyError: document.getElementById('generate-key-error'),
            generatedKeyResult: document.getElementById('generated-key-result'),
            generatedKeyValue: document.getElementById('generated-key-value'),
            copyGeneratedKey: document.getElementById('copy-generated-key'),
            generatedKeyExpires: document.getElementById('generated-key-expires'),
            // New enhanced elements
            uniqueClicksCount: document.getElementById('unique-clicks-count'),
            conversionRate: document.getElementById('conversion-rate'),
            topCountryDisplay: document.getElementById('top-country-display'),
            linkSearchInput: document.getElementById('link-search-input'),
            exportClicksBtn: document.getElementById('export-clicks-btn'),
            bulkDeleteBtn: document.getElementById('bulk-delete-btn'),
            selectAllLinks: document.getElementById('select-all-links'),
            // New feature elements
            rateTodayHuman: document.getElementById('rate-today-human'),
            rateTodayBot: document.getElementById('rate-today-bot'),
            rateTodayTotal: document.getElementById('rate-today-total'),
            rateWeekHuman: document.getElementById('rate-week-human'),
            rateWeekBot: document.getElementById('rate-week-bot'),
            rateWeekTotal: document.getElementById('rate-week-total'),
            rateMonthHuman: document.getElementById('rate-month-human'),
            rateMonthBot: document.getElementById('rate-month-bot'),
            rateMonthTotal: document.getElementById('rate-month-total'),
            hourlyChartCanvas: document.getElementById('hourlyChart'),
            geoSummaryBody: document.getElementById('geo-summary-body'),
            topLinksBody: document.getElementById('top-links-body'),
            userSinceDisplay: document.getElementById('user-since-display'),
        };
    },

    addEventListeners() {
        if (this.ui.adminLoginForm) {
            this.ui.adminLoginForm.addEventListener('submit', (e) => { e.preventDefault(); this.loginWithEmail(); });
        }
        if (this.ui.loginForm) {
            this.ui.loginForm.addEventListener('submit', (e) => { e.preventDefault(); this.login(); });
        }
        if (this.ui.adminTabBtn) {
            this.ui.adminTabBtn.addEventListener('click', () => this.showAuthTab('admin'));
        }
        if (this.ui.accessTabBtn) {
            this.ui.accessTabBtn.addEventListener('click', () => this.showAuthTab('access'));
        }
        if (this.ui.createLinkForm) {
            this.ui.createLinkForm.addEventListener('submit', (e) => { e.preventDefault(); this.createLink(); });
        }
        if (this.ui.addDestinationBtn) {
            this.ui.addDestinationBtn.addEventListener('click', () => this.addDestinationRow());
        }
        if (this.ui.copyResultBtn) {
            this.ui.copyResultBtn.addEventListener('click', () => this.copyToClipboard(this.ui.resultUrl.value));
        }
        if (this.ui.createAnotherBtn) {
            this.ui.createAnotherBtn.addEventListener('click', () => {
                this.ui.resultSection.hidden = true;
                this.ui.createLinkForm.reset();
                this.setDefaultExpiration();
            });
        }
        if (this.ui.addDomainForm) {
            this.ui.addDomainForm.addEventListener('submit', (e) => { e.preventDefault(); this.addDomain(); });
        }
        if (this.ui.createShortLinkForm) {
            this.ui.createShortLinkForm.addEventListener('submit', (e) => { e.preventDefault(); this.createShortLink(); });
        }
        if (this.ui.copyShortLinkBtn) {
            this.ui.copyShortLinkBtn.addEventListener('click', () => this.copyToClipboard(this.ui.shortLinkResultUrl.value));
        }
        if (this.ui.templateForm) {
            this.ui.templateForm.addEventListener('submit', (e) => { e.preventDefault(); this.saveTemplate(); });
        }
        if (this.ui.validateTemplateBtn) {
            this.ui.validateTemplateBtn.addEventListener('click', () => this.validateTemplate());
        }
        if (this.ui.previewTemplateBtn) {
            this.ui.previewTemplateBtn.addEventListener('click', () => this.previewTemplate());
        }
        if (this.ui.loadDefaultTemplateBtn) {
            this.ui.loadDefaultTemplateBtn.addEventListener('click', () => this.loadDefaultTemplate());
        }
        if (this.ui.templatePreviewClose) {
            this.ui.templatePreviewClose.addEventListener('click', () => this.closeTemplatePreview());
        }
        if (this.ui.templatePreviewModal) {
            this.ui.templatePreviewModal.addEventListener('click', (e) => {
                if (e.target === this.ui.templatePreviewModal) this.closeTemplatePreview();
            });
        }
        if (this.ui.menuBtn) {
            this.ui.menuBtn.addEventListener('click', () => this.toggleMenu());
        }
        if (this.ui.sidebarOverlay) {
            this.ui.sidebarOverlay.addEventListener('click', () => this.toggleMenu());
        }
        if (this.ui.logoutBtn) {
            this.ui.logoutBtn.addEventListener('click', () => this.logout());
        }
        if (this.ui.closeModalBtn) {
            this.ui.closeModalBtn.addEventListener('click', () => this.closeAnalyticsModal());
        }
        if (this.ui.clearFeedBtn) {
            this.ui.clearFeedBtn.addEventListener('click', () => this.clearFeed());
        }
        if (this.ui.analyticsModal) {
            this.ui.analyticsModal.addEventListener('click', (e) => {
                if (e.target === this.ui.analyticsModal) this.closeAnalyticsModal();
            });
        }
        this.ui.navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = link.getAttribute('href').substring(1);
                this.showContentSection(targetId);
                if (window.innerWidth <= 768) {
                    this.ui.nav.classList.remove('active');
                    this.ui.sidebarOverlay.classList.remove('active');
                }
            });
        });
        const gotoCreateLink = document.getElementById('goto-create-link');
        if (gotoCreateLink) {
            gotoCreateLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.showContentSection('create-link-section');
            });
        }
        const gotoDashboardBtn = document.getElementById('goto-dashboard-btn');
        if (gotoDashboardBtn) {
            gotoDashboardBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showContentSection('dashboard-section');
            });
        }
        if (this.ui.linksTbody) {
            this.ui.linksTbody.addEventListener('click', (e) => {
                const button = e.target.closest('button.action-btn');
                if (!button) return;
                const id = button.dataset.id;
                const url = button.dataset.url;
                if (button.classList.contains('analytics-btn')) this.showAnalyticsModal(id);
                else if (button.classList.contains('delete-btn')) this.deleteLink(id);
                else if (button.classList.contains('copy-btn')) this.copyToClipboard(url);
                else if (button.classList.contains('toggle-status-btn')) this.toggleLinkStatus(id, button.dataset.active === 'true');
            });
            this.ui.linksTbody.addEventListener('change', (e) => {
                if (e.target.classList.contains('link-select-cb')) {
                    this.updateBulkDeleteVisibility();
                }
            });
        }
        if (this.ui.domainsTbody) {
            this.ui.domainsTbody.addEventListener('click', (e) => {
                if (e.target.closest('button.delete-btn')) {
                    this.deleteDomain(e.target.closest('button.delete-btn').dataset.id);
                }
            });
        }
        if (this.ui.shortLinksTbody) {
            this.ui.shortLinksTbody.addEventListener('click', (e) => {
                const button = e.target.closest('button.action-btn');
                if (!button) return;
                const slug = button.dataset.slug;
                const url = button.dataset.url;
                if (button.classList.contains('copy-btn')) this.copyToClipboard(url);
                else if (button.classList.contains('delete-btn')) this.deleteShortLink(slug);
            });
        }
        if (this.ui.templatesTbody) {
            this.ui.templatesTbody.addEventListener('click', (e) => {
                const button = e.target.closest('button.action-btn');
                if (!button) return;
                const name = button.dataset.name;
                if (button.classList.contains('edit-btn')) this.editTemplate(name);
                else if (button.classList.contains('default-btn')) this.setTemplateDefault(name);
                else if (button.classList.contains('delete-btn')) this.deleteTemplate(name);
            });
        }
        if (this.ui.destinationsContainer) {
            this.ui.destinationsContainer.addEventListener('click', (e) => {
                if (e.target.closest('.remove-destination-btn')) {
                    const rows = this.ui.destinationsContainer.querySelectorAll('.destination-row');
                    if (rows.length > 1) {
                        e.target.closest('.destination-row').remove();
                    }
                }
            });
        }
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && this.token) {
                this.ensureWebSocketConnection();
            }
        });
        window.addEventListener('online', () => {
            if (this.token) this.connectWebSocket();
        });
        if (this.ui.generateKeyForm) {
            this.ui.generateKeyForm.addEventListener('submit', (e) => { e.preventDefault(); this.generateKey(); });
        }
        if (this.ui.copyGeneratedKey) {
            this.ui.copyGeneratedKey.addEventListener('click', () => this.copyToClipboard(this.ui.generatedKeyValue.value));
        }
        // Enhanced feature event listeners
        if (this.ui.linkSearchInput) {
            let searchTimeout;
            this.ui.linkSearchInput.addEventListener('input', () => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => this.searchLinks(), 300);
            });
        }
        if (this.ui.exportClicksBtn) {
            this.ui.exportClicksBtn.addEventListener('click', () => this.exportClicks());
        }
        if (this.ui.bulkDeleteBtn) {
            this.ui.bulkDeleteBtn.addEventListener('click', () => this.bulkDeleteLinks());
        }
        if (this.ui.selectAllLinks) {
            this.ui.selectAllLinks.addEventListener('change', (e) => this.toggleSelectAllLinks(e.target.checked));
        }
    },

    checkInitialAuth() {
        this.token = localStorage.getItem('authToken');
        const username = localStorage.getItem('authUser');
        if (this.token && username) {
            try {
                this.user = JSON.parse(atob(this.token.split('.')[1]));
                this.showPanel(username);
            } catch (e) {
                this.logout();
            }
        } else {
            this.showAuth();
        }
    },

    async handleApiCall(url, options = {}, requiresAuth = true) {
        const headers = { 'Content-Type': 'application/json', ...options.headers };
        if (requiresAuth && this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        try {
            const res = await fetch(url, { ...options, headers });
            if (res.status === 204) return null;
            const resData = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(resData.error || `HTTP error! Status: ${res.status}`);
            return resData;
        } catch (err) {
            console.error('API call failed:', err);
            if (err.message.includes('Unauthorized') || err.message.includes('token')) {
                this.logout();
            }
            throw err;
        }
    },

    async login() {
        const accessKey = this.ui.loginAccessKey.value.trim();
        this.ui.loginError.textContent = '';
        if (!accessKey) return;
        try {
            const data = await this.handleApiCall('/api/auth/access', {
                method: 'POST',
                body: JSON.stringify({ accessKey })
            }, false);
            this.token = data.token;
            localStorage.setItem('authToken', this.token);
            const username = JSON.parse(atob(data.token.split('.')[1])).user;
            localStorage.setItem('authUser', username);
            this.checkInitialAuth();
        } catch (err) {
            this.ui.loginError.textContent = err.message;
        }
    },

    logout() {
        this.token = null;
        this.user = null;
        localStorage.clear();
        if (this.ws) { this.ws.close(); this.ws = null; }
        if (this.charts.human) this.charts.human.destroy();
        if (this.charts.bot) this.charts.bot.destroy();
        if (this.charts.hourly) this.charts.hourly.destroy();
        this.showAuth();
    },

    showAuth() {
        this.ui.authSection.style.display = 'flex';
        this.ui.panel.hidden = true;
        this.showAuthTab('admin');
    },

    showAuthTab(tab) {
        if (tab === 'admin') {
            this.ui.adminLoginForm.style.display = '';
            this.ui.loginForm.style.display = 'none';
            this.ui.adminTabBtn.classList.add('active');
            this.ui.accessTabBtn.classList.remove('active');
        } else {
            this.ui.adminLoginForm.style.display = 'none';
            this.ui.loginForm.style.display = '';
            this.ui.adminTabBtn.classList.remove('active');
            this.ui.accessTabBtn.classList.add('active');
        }
    },

    async loginWithEmail() {
        const email = this.ui.adminEmailInput.value.trim();
        this.ui.adminLoginError.textContent = '';
        if (!email) return;
        try {
            const data = await this.handleApiCall('/api/auth/admin-email', {
                method: 'POST',
                body: JSON.stringify({ email })
            }, false);
            this.token = data.token;
            localStorage.setItem('authToken', this.token);
            try {
                const username = JSON.parse(atob(data.token.split('.')[1])).user;
                localStorage.setItem('authUser', username);
            } catch (e) {
                localStorage.setItem('authUser', email);
            }
            this.checkInitialAuth();
        } catch (err) {
            this.ui.adminLoginError.textContent = err.message;
        }
    },

    async showPanel(user) {
        this.ui.authSection.style.display = 'none';
        this.ui.panel.hidden = false;
        this.ui.usernameDisplay.textContent = user;
        if (this.ui.userAvatar) {
            this.ui.userAvatar.textContent = user.charAt(0).toUpperCase();
        }
        // Set role display
        const isAdmin = this.user && this.user.role === 'admin';
        if (this.ui.userRoleDisplay) {
            this.ui.userRoleDisplay.textContent = isAdmin ? 'Administrator' : 'User';
        }
        // Toggle admin navigation visibility based on role
        if (this.ui.adminNavItem) {
            this.ui.adminNavItem.style.display = isAdmin ? '' : 'none';
        }
        const host = window.location.host;
        if (this.ui.cnameTarget) this.ui.cnameTarget.textContent = host;
        if (this.ui.cnameTargetDomains) this.ui.cnameTargetDomains.textContent = host;
        this.setDefaultExpiration();
        this.ui.destinationsContainer.innerHTML = '';
        this.addDestinationRow();
        this.connectWebSocket();
        await this.loadInitialData();
        this.loadTemplateTokens();
        this.showContentSection('dashboard-section');
    },

    setDefaultExpiration() {
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);
        this.ui.expiresAtInput.value = nextWeek.toISOString().split('T')[0];
    },

    showContentSection(targetId) {
        this.ui.contentSections.forEach(section => section.hidden = section.id !== targetId);
        this.ui.navLinks.forEach(navLink => {
            navLink.classList.toggle('active', navLink.getAttribute('href') === `#${targetId}`);
        });
    },

    toggleMenu() {
        this.ui.nav.classList.toggle('active');
        this.ui.sidebarOverlay.classList.toggle('active');
    },

    async generateKey() {
        const targetEmail = this.ui.targetEmail.value.trim();
        this.ui.generateKeyError.textContent = '';
        this.ui.generatedKeyResult.hidden = true;
        if (!targetEmail) return;
        try {
            const data = await this.handleApiCall('/api/admin/generate-key', {
                method: 'POST',
                body: JSON.stringify({ targetEmail })
            });
            this.ui.generatedKeyValue.value = data.accessKey;
            this.ui.generatedKeyExpires.textContent = `Expires: ${new Date(data.expiresAt).toLocaleDateString()}`;
            this.ui.generatedKeyResult.hidden = false;
            this.showToast('success', 'Key Generated', 'Access key generated successfully!');
        } catch (err) {
            this.ui.generateKeyError.textContent = err.message;
        }
    },

    addDestinationRow() {
        const row = document.createElement('div');
        row.className = 'destination-row';
        row.innerHTML = `
            <div>
                <input type="url" class="dest-url" placeholder="https://landing-page.com/offer" required>
            </div>
            <div>
                <select class="dest-platform">
                    <option value="desktop">All Devices</option>
                    <option value="ios">📱 iOS</option>
                    <option value="android">📱 Android</option>
                    <option value="windows">💻 Windows</option>
                    <option value="macos">💻 MacOS</option>
                </select>
            </div>
            <div>
                <input type="number" class="dest-weight" placeholder="%" value="100" min="1" max="100" required>
            </div>
            <button type="button" class="remove-destination-btn" title="Remove Destination">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        `;
        this.ui.destinationsContainer.appendChild(row);
    },

    async loadInitialData() {
        try {
            const [links, domains, stats, shortLinks, shortLinkStats, templates, dashboardStats, rateSummary, geoSummary, topLinks, hourlyStats, userProfile] = await Promise.all([
                this.handleApiCall('/api/links'),
                this.handleApiCall('/api/domains'),
                this.handleApiCall('/api/stats/clicks-by-day?days=14'),
                this.handleApiCall('/api/short-links'),
                this.handleApiCall('/api/short-links/stats'),
                this.handleApiCall('/api/templates'),
                this.handleApiCall('/api/stats/dashboard'),
                this.handleApiCall('/api/stats/rate-summary').catch(() => null),
                this.handleApiCall('/api/stats/geo-summary').catch(() => null),
                this.handleApiCall('/api/stats/top-links?limit=10').catch(() => null),
                this.handleApiCall('/api/stats/hourly?hours=24').catch(() => null),
                this.handleApiCall('/api/me').catch(() => null),
            ]);
            this.links = links || [];
            this.domains = domains || [];
            this.shortLinks = shortLinks || [];
            this.templates = templates || [];
            this.totalHumanClicks = this.links.reduce((sum, l) => sum + (l.clicks || 0), 0);
            this.totalBotClicks = this.links.reduce((sum, l) => sum + (l.botClicks || 0), 0);
            this.updateStats();
            this.updateDashboardStats(dashboardStats);
            this.updateShortLinkStats(shortLinkStats);
            this.renderLinksTable();
            this.renderDomains();
            this.renderShortLinksTable();
            this.renderTemplatesTable();
            this.renderClickCharts(stats || []);
            this.updateRateSummary(rateSummary);
            this.renderGeoSummary(geoSummary);
            this.renderTopLinks(topLinks);
            this.renderHourlyChart(hourlyStats);
            this.updateUserProfile(userProfile);
        } catch (err) {
            console.error("Failed to load initial data:", err);
        }
    },

    updateStats() {
        if (this.ui.totalHumanClicks) {
            this.ui.totalHumanClicks.textContent = this.totalHumanClicks.toLocaleString();
        }
        if (this.ui.totalBotClicks) {
            this.ui.totalBotClicks.textContent = this.totalBotClicks.toLocaleString();
        }
        if (this.ui.totalLinks) {
            this.ui.totalLinks.textContent = this.links.length;
        }
        if (this.ui.totalShortLinks) {
            this.ui.totalShortLinks.textContent = this.shortLinks.length;
        }
    },

    updateShortLinkStats(stats) {
        if (stats) {
            if (this.ui.shortLinksTotal) {
                this.ui.shortLinksTotal.textContent = stats.totalLinks || 0;
            }
            if (this.ui.shortLinksClicks) {
                this.ui.shortLinksClicks.textContent = stats.totalClicks || 0;
            }
            if (this.ui.totalShortLinks) {
                this.ui.totalShortLinks.textContent = stats.totalLinks || 0;
            }
        }
    },

    async createLink() {
        const destinations = Array.from(
            this.ui.destinationsContainer.querySelectorAll('.destination-row')
        ).map(row => ({
            url: row.querySelector('.dest-url').value.trim(),
            platform: row.querySelector('.dest-platform').value,
            weight: parseInt(row.querySelector('.dest-weight').value, 10)
        }));
        this.ui.createError.textContent = '';
        if (destinations.some(d => !d.url || !d.weight || d.weight < 1)) {
            this.ui.createError.textContent = 'Please fill all destination fields correctly.';
            return;
        }
        const linkData = {
            rotations: destinations,
            expiresAt: new Date(this.ui.expiresAtInput.value).toISOString(),
            customDomain: this.ui.customDomainSelect.value || undefined,
        };
        try {
            const newLink = await this.handleApiCall('/api/links', {
                method: 'POST',
                body: JSON.stringify(linkData),
                headers: { 'x-license-key': this.ui.licenseKeyInput.value.trim() }
            });
            this.ui.resultUrl.value = newLink.googleAdsUrl;
            this.ui.resultSection.hidden = false;
            this.links.unshift(newLink);
            this.updateStats();
            this.renderLinksTable();
            this.showToast('success', 'Link Created!', 'Your redirect link has been generated.');
        } catch (err) {
            this.ui.createError.textContent = err.message;
        }
    },

    async deleteLink(id) {
        if (!confirm('Are you sure you want to delete this link? This action is permanent.')) return;
        try {
            await this.handleApiCall(`/api/links/${id}`, { method: 'DELETE' });
            this.links = this.links.filter(link => link.id !== id);
            this.updateStats();
            this.renderLinksTable();
            this.showToast('info', 'Link Deleted', 'The link has been removed.');
        } catch (err) {
            this.showToast('error', 'Error', err.message);
        }
    },

    async addDomain() {
        const hostname = this.ui.domainInput.value.trim();
        this.ui.domainError.textContent = '';
        if (!hostname) return;
        try {
            const newDomain = await this.handleApiCall('/api/domains', {
                method: 'POST',
                body: JSON.stringify({ hostname }),
            });
            this.ui.domainInput.value = '';
            this.domains.push(newDomain);
            this.renderDomains();
            this.showToast('success', 'Domain Added', `${hostname} has been added.`);
        } catch (err) {
            this.ui.domainError.textContent = err.message;
        }
    },

    async deleteDomain(id) {
        if (!confirm('Are you sure you want to delete this domain?')) return;
        try {
            await this.handleApiCall(`/api/domains/${id}`, { method: 'DELETE' });
            this.domains = this.domains.filter(d => d.id !== parseInt(id));
            this.renderDomains();
            this.showToast('info', 'Domain Deleted', 'The domain has been removed.');
        } catch (err) {
            this.showToast('error', 'Error', err.message);
        }
    },

    async createShortLink() {
        const targetUrl = this.ui.shortLinkUrl.value.trim();
        const alias = this.ui.shortLinkAlias.value.trim() || null;
        const title = this.ui.shortLinkTitle.value.trim() || null;
        this.ui.shortLinkError.textContent = '';
        this.ui.shortLinkResult.hidden = true;
        if (!targetUrl) {
            this.ui.shortLinkError.textContent = 'Please enter a destination URL.';
            return;
        }
        try {
            const result = await this.handleApiCall('/api/short-links', {
                method: 'POST',
                body: JSON.stringify({ targetUrl, alias, title })
            });
            this.ui.shortLinkResultUrl.value = result.fullShortUrl;
            this.ui.shortLinkResult.hidden = false;
            this.ui.shortLinkUrl.value = '';
            this.ui.shortLinkAlias.value = '';
            this.ui.shortLinkTitle.value = '';
            this.shortLinks.unshift(result);
            this.renderShortLinksTable();
            const stats = await this.handleApiCall('/api/short-links/stats');
            this.updateShortLinkStats(stats);
            this.showToast('success', 'Short Link Created!', 'Your short URL is ready to use.');
        } catch (err) {
            this.ui.shortLinkError.textContent = err.message;
        }
    },

    async deleteShortLink(slug) {
        if (!confirm('Are you sure you want to delete this short link?')) return;
        try {
            await this.handleApiCall(`/api/short-links/${slug}`, { method: 'DELETE' });
            this.shortLinks = this.shortLinks.filter(link => link.slug !== slug);
            this.renderShortLinksTable();
            const stats = await this.handleApiCall('/api/short-links/stats');
            this.updateShortLinkStats(stats);
            this.showToast('info', 'Short Link Deleted', 'The short link has been removed.');
        } catch (err) {
            this.showToast('error', 'Error', err.message);
        }
    },

    renderShortLinksTable() {
        if (!this.ui.shortLinksTbody) return;
        this.ui.shortLinksTbody.innerHTML = '';
        const hasLinks = this.shortLinks.length > 0;
        if (this.ui.noShortLinksMessage) {
            this.ui.noShortLinksMessage.style.display = hasLinks ? 'none' : 'block';
        }
        if (!hasLinks) return;
        this.shortLinks.forEach(link => {
            const tr = document.createElement('tr');
            const createdDate = new Date(link.createdAt).toLocaleDateString();
            const shortUrl = link.fullShortUrl || `/s/${link.slug}`;
            let destDisplay = link.targetUrl;
            try {
                destDisplay = new URL(link.targetUrl).hostname;
            } catch (e) {
                destDisplay = link.targetUrl.substring(0, 30) + '...';
            }
            tr.innerHTML = `
                <td data-label="Short URL">
                    <a href="${shortUrl}" target="_blank" class="text-link">/s/${link.slug}</a>
                </td>
                <td data-label="Destination">
                    <div class="url-cell" title="${link.targetUrl}">${destDisplay}</div>
                </td>
                <td data-label="Title">${link.title || '-'}</td>
                <td data-label="Clicks" class="text-right"><strong>${link.clicks || 0}</strong></td>
                <td data-label="Created">${createdDate}</td>
                <td data-label="Actions" class="text-center">
                    <div class="action-buttons">
                        <button class="action-btn copy-btn" data-url="${shortUrl}" title="Copy">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        </button>
                        <button class="action-btn delete-btn" data-slug="${link.slug}" title="Delete">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>
                </td>
            `;
            this.ui.shortLinksTbody.appendChild(tr);
        });
    },

    async loadTemplateTokens() {
        try {
            const data = await this.handleApiCall('/api/templates/tokens', {}, false);
            if (this.ui.tokenList && data.tokens) {
                this.ui.tokenList.innerHTML = data.tokens.map(token =>
                    `<span class="token-badge" title="${data.descriptions[token] || ''}">${token}</span>`
                ).join('');
            }
        } catch (err) {
            console.error('Failed to load tokens:', err);
        }
    },

    async loadDefaultTemplate() {
        try {
            const data = await this.handleApiCall('/api/templates/default-system', {}, false);
            if (this.ui.templateHtml && data.htmlContent) {
                this.ui.templateHtml.value = data.htmlContent;
                this.showToast('info', 'Template Loaded', 'System default template loaded into editor.');
            }
        } catch (err) {
            this.showToast('error', 'Error', err.message);
        }
    },

    async validateTemplate() {
        const htmlContent = this.ui.templateHtml.value;
        if (!htmlContent) {
            this.ui.templateError.textContent = 'Please enter HTML content to validate.';
            return;
        }
        this.ui.templateError.textContent = '';
        this.ui.templateValidationResult.hidden = true;
        
        try {
            // Enhanced: Send POST request to validator
            const result = await this.handleApiCall('/api/templates/validate', {
                method: 'POST',
                body: JSON.stringify({ htmlContent })
            }, false);
            
            this.ui.templateValidationResult.hidden = false;
            
            if (result.isValid) {
                this.ui.templateValidationResult.className = 'validation-result success';
                let html = '<strong>✓ Template is valid!</strong>';
                
                // Show smart extraction warnings/info
                if (result.warnings && result.warnings.length > 0) {
                    html += '<ul class="warning-list">';
                    result.warnings.forEach(w => {
                        html += `<li>⚠️ ${w}</li>`;
                    });
                    html += '</ul>';
                }
                
                this.ui.templateValidationResult.innerHTML = html;
            } else {
                this.ui.templateValidationResult.className = 'validation-result error';
                let html = '<strong>✗ Validation failed: </strong><ul>';
                result.errors.forEach(e => {
                    html += `<li>${e}</li>`;
                });
                html += '</ul>';
                this.ui.templateValidationResult.innerHTML = html;
            }
        } catch (err) {
            this.ui.templateError.textContent = err.message;
        }
    },

    async previewTemplate() {
        const htmlContent = this.ui.templateHtml.value;
        if (!htmlContent) {
            this.ui.templateError.textContent = 'Please enter HTML content to preview.';
            return;
        }
        this.ui.templateError.textContent = '';
        try {
            const result = await this.handleApiCall('/api/templates/preview', {
                method: 'POST',
                body: JSON.stringify({
                    htmlContent,
                    destinationUrl: 'https://example.com/destination'
                })
            }, false);
            
            if (result.processedHtml) {
                this.ui.templatePreviewModal.style.display = 'flex';
                this.ui.templatePreviewModal.classList.add('active');
                const iframe = this.ui.templatePreviewIframe;
                iframe.srcdoc = result.processedHtml;
                
                // Show report on Smart Extraction or Sanitization
                let reportMsg = [];
                const report = result.sanitizationReport || {};
                
                if (report.extracted) {
                    reportMsg.push(`✨ ${report.extracted}`);
                }
                
                if (report.removedItems && report.removedItems.length > 0) {
                    reportMsg.push(`🛡️ Sanitized ${report.removedItems.length} unsafe items (redirects/meta).`);
                }
                
                if (reportMsg.length > 0) {
                    this.showToast('info', 'Processing Report', reportMsg.join('\n'));
                }
            }
        } catch (err) {
            this.ui.templateError.textContent = err.message;
        }
    },

    closeTemplatePreview() {
        this.ui.templatePreviewModal.style.display = 'none';
        this.ui.templatePreviewModal.classList.remove('active');
        this.ui.templatePreviewIframe.srcdoc = '';
    },

    async saveTemplate() {
        const name = this.ui.templateName.value.trim();
        const description = this.ui.templateDescription.value.trim();
        const htmlContent = this.ui.templateHtml.value;
        const isDefault = this.ui.templateIsDefault.checked;
        this.ui.templateError.textContent = '';
        if (!name) {
            this.ui.templateError.textContent = 'Please enter a template name.';
            return;
        }
        if (!htmlContent) {
            this.ui.templateError.textContent = 'Please enter HTML content.';
            return;
        }
        try {
            const result = await this.handleApiCall('/api/templates', {
                method: 'POST',
                body: JSON.stringify({ name, description, htmlContent, isDefault })
            });
            this.ui.templateName.value = '';
            this.ui.templateDescription.value = '';
            this.ui.templateHtml.value = '';
            this.ui.templateIsDefault.checked = false;
            this.ui.templateValidationResult.hidden = true;
            const templates = await this.handleApiCall('/api/templates');
            this.templates = templates || [];
            this.renderTemplatesTable();
            const action = result.created ? 'Created' : 'Updated';
            this.showToast('success', `Template ${action}!`, `"${name}" has been saved.`);
        } catch (err) {
            this.ui.templateError.textContent = err.message;
        }
    },

    async editTemplate(name) {
        try {
            const template = await this.handleApiCall(`/api/templates/${encodeURIComponent(name)}`);
            if (template) {
                this.ui.templateName.value = template.name;
                this.ui.templateDescription.value = template.description || '';
                this.ui.templateHtml.value = template.htmlContent;
                this.ui.templateIsDefault.checked = template.isDefault === 1;
                this.ui.templateValidationResult.hidden = true;
                this.showContentSection('templates-section');
                this.ui.templateName.focus();
                this.showToast('info', 'Template Loaded', `Editing "${name}"`);
            }
        } catch (err) {
            this.showToast('error', 'Error', err.message);
        }
    },

    async setTemplateDefault(name) {
        try {
            await this.handleApiCall(`/api/templates/${encodeURIComponent(name)}/default`, {
                method: 'PUT'
            });
            const templates = await this.handleApiCall('/api/templates');
            this.templates = templates || [];
            this.renderTemplatesTable();
            this.showToast('success', 'Default Set', `"${name}" is now your default template.`);
        } catch (err) {
            this.showToast('error', 'Error', err.message);
        }
    },

    async deleteTemplate(name) {
        if (!confirm(`Are you sure you want to delete the template "${name}"?`)) return;
        try {
            await this.handleApiCall(`/api/templates/${encodeURIComponent(name)}`, { method: 'DELETE' });
            this.templates = this.templates.filter(t => t.name !== name);
            this.renderTemplatesTable();
            this.showToast('info', 'Template Deleted', `"${name}" has been removed.`);
        } catch (err) {
            this.showToast('error', 'Error', err.message);
        }
    },

    renderTemplatesTable() {
        if (!this.ui.templatesTbody) return;
        this.ui.templatesTbody.innerHTML = '';
        const hasTemplates = this.templates.length > 0;
        if (this.ui.noTemplatesMessage) {
            this.ui.noTemplatesMessage.style.display = hasTemplates ? 'none' : 'block';
        }
        if (!hasTemplates) return;
        this.templates.forEach(template => {
            const tr = document.createElement('tr');
            const updatedDate = new Date(template.updatedAt).toLocaleDateString();
            const sizeKb = ((template.contentSize || 0) / 1024).toFixed(1);
            tr.innerHTML = `
                <td data-label="Name"><strong>${template.name}</strong></td>
                <td data-label="Description">${template.description || '-'}</td>
                <td data-label="Size">${sizeKb} KB</td>
                <td data-label="Default">
                    ${template.isDefault ? '<span class="badge badge-success">Default</span>' : '-'}
                </td>
                <td data-label="Updated">${updatedDate}</td>
                <td data-label="Actions" class="text-center">
                    <div class="action-buttons">
                        <button class="action-btn edit-btn" data-name="${template.name}" title="Edit">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        ${!template.isDefault ? `
                        <button class="action-btn default-btn" data-name="${template.name}" title="Set as Default">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                        </button>
                        ` : ''}
                        <button class="action-btn delete-btn" data-name="${template.name}" title="Delete">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>
                </td>
            `;
            this.ui.templatesTbody.appendChild(tr);
        });
    },

    async showAnalyticsModal(linkId) {
        this.ui.analyticsModal.classList.add('active');
        this.ui.analyticsModal.style.display = 'flex';
        this.ui.analyticsContent.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Loading analytics...</p></div>';
        try {
            const clicks = await this.handleApiCall(`/api/links/${linkId}/analytics`);
            if (this.ui.analyticsModal.classList.contains('active')) {
                this.renderAnalytics(clicks);
            }
        } catch (err) {
            this.ui.analyticsContent.innerHTML = `<div class="error-state"><p>Could not load analytics: ${err.message}</p></div>`;
        }
    },

    closeAnalyticsModal() {
        this.ui.analyticsModal.classList.remove('active');
        this.ui.analyticsModal.style.display = 'none';
    },

    renderAnalytics(clicks) {
        if (!clicks || clicks.length === 0) {
            this.ui.analyticsContent.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div><p>No analytics data yet.</p></div>';
            return;
        }
        const byCountry = {}, byReferrer = {}, byDestination = {};
        let humanCount = 0, botCount = 0;
        clicks.forEach(click => {
            if (click.isBot) {
                botCount++;
            } else {
                humanCount++;
                const country = click.country || 'Unknown';
                const referrer = click.referrer || 'Direct';
                const dest = click.destinationUrl || 'N/A';
                byCountry[country] = (byCountry[country] || 0) + 1;
                byReferrer[referrer] = (byReferrer[referrer] || 0) + 1;
                byDestination[dest] = (byDestination[dest] || 0) + 1;
            }
        });
        const makeTable = (data) => {
            const entries = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 10);
            if (entries.length === 0) return '<tr><td colspan="2" class="text-muted">No data</td></tr>';
            return entries.map(([k, v]) => `<tr><td class="url-cell" title="${k}">${k}</td><td>${v}</td></tr>`).join('');
        };
        this.ui.analyticsContent.innerHTML = `
            <div class="analytics-stats">
                <div class="stat-card human">
                    <div class="stat-icon">👤</div>
                    <div class="stat-info">
                        <span class="stat-value">${humanCount}</span>
                        <span class="stat-label">Human Clicks</span>
                    </div>
                </div>
                <div class="stat-card bot">
                    <div class="stat-icon">🤖</div>
                    <div class="stat-info">
                        <span class="stat-value">${botCount}</span>
                        <span class="stat-label">Bot Clicks</span>
                    </div>
                </div>
            </div>
            <div class="analytics-grid">
                <div class="analytics-table">
                    <h4>🌍 Top Countries</h4>
                    <table><thead><tr><th>Country</th><th>Clicks</th></tr></thead><tbody>${makeTable(byCountry)}</tbody></table>
                </div>
                <div class="analytics-table">
                    <h4>🔗 Top Referrers</h4>
                    <table><thead><tr><th>Referrer</th><th>Clicks</th></tr></thead><tbody>${makeTable(byReferrer)}</tbody></table>
                </div>
                <div class="analytics-table">
                    <h4>🎯 Top Destinations</h4>
                    <table><thead><tr><th>URL</th><th>Clicks</th></tr></thead><tbody>${makeTable(byDestination)}</tbody></table>
                </div>
            </div>
        `;
    },

    renderLinksTable() {
        this.ui.linksTbody.innerHTML = '';
        const hasLinks = this.links.length > 0;
        this.ui.noLinksMessage.style.display = hasLinks ? 'none' : 'block';
        if (!hasLinks) return;
        this.links.forEach(link => {
            const tr = this._createLinkRow(link);
            this.ui.linksTbody.appendChild(tr);
        });
    },

    _createLinkRow(link) {
        const tr = document.createElement('tr');
        tr.dataset.linkId = link.id;
        const expirationDate = new Date(link.expiresAt).toLocaleDateString();
        const shortId = link.id.substring(0, 8) + '...';
        const tagsDisplay = link.tags || '';
        const isActive = link.isActive !== 0;
        tr.innerHTML = `
            <td data-label="Select">
                <input type="checkbox" class="link-select-cb" data-id="${link.id}">
            </td>
            <td data-label="Link ID">
                <span class="code-badge" title="${link.id}">${shortId}</span>
            </td>
            <td data-label="Destination">
                <div class="url-cell" style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    <a href="${link.destinationUrlDesktop}" target="_blank" class="text-link" style="color: var(--primary);">
                        ${link.destinationUrlDesktop}
                    </a>
                </div>
            </td>
            <td data-label="Human" class="text-right human-clicks-cell">
                <strong>${link.clicks || 0}</strong>
            </td>
            <td data-label="Bot" class="text-right bot-clicks-cell">
                ${link.botClicks || 0}
            </td>
            <td data-label="Status">
                <button class="action-btn toggle-status-btn ${isActive ? 'status-active' : 'status-paused'}" data-id="${link.id}" data-active="${isActive}" title="${isActive ? 'Click to pause' : 'Click to resume'}">
                    <span class="status-badge-pill ${isActive ? 'badge-success' : 'badge-warning'}">${isActive ? 'Active' : 'Paused'}</span>
                </button>
            </td>
            <td data-label="Tags">
                <span class="tag-badge" title="Click to edit tags">${tagsDisplay || '—'}</span>
            </td>
            <td data-label="Expires">
                ${expirationDate}
            </td>
            <td data-label="Actions" class="text-center">
                <div class="action-buttons">
                    <button class="action-btn copy-btn" data-url="${link.googleAdsUrl}" title="Copy Link">
                       <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    </button>
                    <button class="action-btn analytics-btn" data-id="${link.id}" title="Analytics">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
                    </button>
                    <button class="action-btn delete-btn" data-id="${link.id}" title="Delete">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </div>
            </td>
        `;
        return tr;
    },

    renderDomains() {
        this.ui.customDomainSelect.innerHTML = '<option value="">Use Default Domain</option>';
        const hasDomains = this.domains && this.domains.length > 0;
        this.ui.noDomainsMessage.style.display = hasDomains ? 'none' : 'block';
        if (!hasDomains) {
            this.ui.domainsTbody.innerHTML = '';
            return;
        }
        this.ui.domainsTbody.innerHTML = '';
        this.domains.forEach(domain => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td data-label="Hostname">${domain.hostname}</td>
                <td data-label="Status"><span class="badge badge-success">Active</span></td>
                <td data-label="Actions" class="text-right">
                    <button class="action-btn delete-btn" data-id="${domain.id}" title="Delete">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </td>
            `;
            this.ui.domainsTbody.appendChild(tr);
            const option = document.createElement('option');
            option.value = domain.hostname;
            option.textContent = domain.hostname;
            this.ui.customDomainSelect.appendChild(option);
        });
    },

    renderClickCharts(stats) {
        if (typeof Chart === 'undefined') return;
        if (this.charts.human) this.charts.human.destroy();
        if (this.charts.bot) this.charts.bot.destroy();
        const labels = stats.map(s => new Date(s.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
        const humanData = stats.map(s => s.humanClicks || 0);
        const botData = stats.map(s => s.botClicks || 0);
        const commonOptions = {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            scales: {
                y: { beginAtZero: true, ticks: { color: '#94a3b8', precision: 0 }, grid: { color: 'rgba(148, 163, 184, 0.1)' } },
                x: { ticks: { color: '#94a3b8' }, grid: { display: false } }
            },
            plugins: {
                legend: { display: false },
                tooltip: { backgroundColor: '#1e293b', titleColor: '#f1f5f9', bodyColor: '#94a3b8', borderColor: '#334155', borderWidth: 1, padding: 12, cornerRadius: 8 }
            }
        };
        this.charts.human = new Chart(this.ui.humanClicksChartCanvas, {
            type: 'line',
            data: { labels, datasets: [{ label: 'Human Clicks', data: humanData, borderColor: '#22c55e', backgroundColor: 'rgba(34, 197, 94, 0.1)', fill: true, tension: 0.4, pointBackgroundColor: '#22c55e', pointRadius: 3, pointHoverRadius: 5 }] },
            options: commonOptions
        });
        this.charts.bot = new Chart(this.ui.botClicksChartCanvas, {
            type: 'line',
            data: { labels, datasets: [{ label: 'Bot Clicks', data: botData, borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)', fill: true, tension: 0.4, pointBackgroundColor: '#f59e0b', pointRadius: 3, pointHoverRadius: 5 }] },
            options: commonOptions
        });
    },

    updateWsStatus(status) {
        const elements = [this.ui.wsStatus, this.ui.wsStatusNav].filter(el => el);
        elements.forEach(el => {
            el.className = status === 'connected' ? 'connection-status connected' : 'connection-status disconnected';
            const textEl = el.querySelector('.status-text');
            if (textEl) {
                textEl.textContent = status === 'connected' ? 'Connected' : (status === 'connecting' ? 'Connecting...' : 'Offline');
            }
        });
        if (this.ui.liveIndicator) {
            this.ui.liveIndicator.style.opacity = status === 'connected' ? '1' : '0.5';
        }
    },

    ensureWebSocketConnection() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.connectWebSocket();
        }
    },

    connectWebSocket() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
        this.updateWsStatus('connecting');
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        try {
            this.ws = new WebSocket(wsUrl);
        } catch (err) {
            console.error('[WS] Error:', err);
            this.scheduleReconnect();
            return;
        }
        this.ws.addEventListener('open', () => {
            console.log('[WS] Connected');
            this.wsReconnectAttempts = 0;
            this.updateWsStatus('connected');
            if (this.user && this.user.id) {
                this.ws.send(JSON.stringify({ type: 'AUTH', token: this.token }));
            }
        });
        this.ws.addEventListener('message', (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'PING') {
                    this.ws.send(JSON.stringify({ type: 'PONG' }));
                } else if (data.type === 'NEW_CLICK' || data.type === 'LIVE_CLICK') {
                    this.handleLiveClickUpdate(data.payload || data);
                }
            } catch (err) {
                console.error('[WS] Parse error:', err);
            }
        });
        this.ws.addEventListener('close', () => {
            this.updateWsStatus('disconnected');
            this.scheduleReconnect();
        });
        this.ws.addEventListener('error', () => {
            this.updateWsStatus('disconnected');
        });
    },

    scheduleReconnect() {
        if (this.wsReconnectAttempts >= this.wsMaxReconnectAttempts) return;
        this.wsReconnectAttempts++;
        const delay = Math.min(this.wsReconnectDelay * Math.pow(2, this.wsReconnectAttempts - 1), 30000);
        setTimeout(() => { if (this.token) this.connectWebSocket(); }, delay);
    },

    handleLiveClickUpdate(payload) {
        const linkId = payload.linkId;
        const isBot = payload.isBot !== undefined ? payload.isBot : (payload.clickType === 'bot');
        const clickType = isBot ? 'bot' : 'human';
        const country = payload.country || 'Unknown';
        const timestamp = payload.timestamp || Date.now();
        if (clickType === 'human') this.totalHumanClicks++;
        else this.totalBotClicks++;
        this.updateStats();
        this.addFeedItem({ linkId, clickType, country, timestamp });
        const link = this.links.find(l => l.id === linkId);
        if (link) {
            if (clickType === 'human') link.clicks = (link.clicks || 0) + 1;
            else link.botClicks = (link.botClicks || 0) + 1;
            const row = this.ui.linksTbody.querySelector(`tr[data-link-id="${linkId}"]`);
            if (row) {
                const cell = row.querySelector(clickType === 'human' ? '.human-clicks-cell' : '.bot-clicks-cell');
                if (cell) {
                    const newValue = clickType === 'human' ? link.clicks : link.botClicks;
                    cell.innerHTML = `<strong>${newValue}</strong>`;
                    cell.style.color = clickType === 'human' ? '#22c55e' : '#f59e0b';
                    setTimeout(() => cell.style.color = '', 1000);
                }
            }
        }
        this.updateChartWithNewClick(clickType);
        this.showClickToast(clickType, country);
    },

    addFeedItem({ linkId, clickType, country, timestamp }) {
        const emptyState = this.ui.liveFeedSection.querySelector('.empty-feed');
        if (emptyState) emptyState.remove();
        this.feedEventCount++;
        if (this.ui.feedCount) {
            this.ui.feedCount.textContent = `${this.feedEventCount} event${this.feedEventCount !== 1 ? 's' : ''}`;
        }
        const link = this.links.find(l => l.id === linkId);
        let linkName = 'Unknown Link';
        if (link && link.destinationUrlDesktop) {
            try {
                linkName = new URL(link.destinationUrlDesktop).hostname;
            } catch (e) {
                linkName = link.destinationUrlDesktop.substring(0, 20) + '...';
            }
        }
        const time = new Date(timestamp).toLocaleTimeString();
        const icon = clickType === 'human' ? '👤' : '🤖';
        const typeLabel = clickType === 'human' ? 'Human Visit' : 'Bot Blocked';
        const feedItem = document.createElement('div');
        feedItem.className = `feed-item ${clickType}`;
        feedItem.style.opacity = '0';
        feedItem.style.transform = 'translateY(-10px)';
        feedItem.style.transition = 'all 0.3s ease';
        feedItem.innerHTML = `
            <div style="display: flex; justify-content:space-between; align-items:center; width:100%;">
                <div style="display:flex; align-items:center; gap:12px;">
                    <div style="font-size:1.2rem;">${icon}</div>
                    <div>
                        <div style="font-weight:600; font-size:0.9rem;">${typeLabel}</div>
                        <div style="font-size:0.8rem; color:#94a3b8;">${linkName} • ${country}</div>
                    </div>
                </div>
                <div style="font-size:0.75rem; color:#64748b;">${time}</div>
            </div>
        `;
        this.ui.liveFeedSection.insertBefore(feedItem, this.ui.liveFeedSection.firstChild);
        setTimeout(() => {
            feedItem.style.opacity = '1';
            feedItem.style.transform = 'translateY(0)';
        }, 50);
        if (this.ui.liveFeedSection.children.length > 20) {
            this.ui.liveFeedSection.lastChild.remove();
        }
    },

    clearFeed() {
        this.ui.liveFeedSection.innerHTML = '<div class="empty-feed"><p>Waiting for incoming traffic...</p></div>';
        this.feedEventCount = 0;
        if (this.ui.feedCount) this.ui.feedCount.textContent = '0 events';
    },

    updateChartWithNewClick(type) {
        if (!this.charts.human || !this.charts.bot) return;
        const chart = type === 'human' ? this.charts.human : this.charts.bot;
        const lastIndex = chart.data.datasets[0].data.length - 1;
        chart.data.datasets[0].data[lastIndex]++;
        chart.update('none');
    },

    showClickToast(type, country) {
        const title = type === 'human' ? 'Human Verified' : 'Bot Blocked';
        const message = `Traffic from ${country}`;
        this.showToast(type === 'human' ? 'success' : 'warning', title, message, 3000);
    },

    showToast(type, title, message, duration = 5000) {
        if (!this.ui.toastContainer) return;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        // Updated structure to match your CSS file
        let icon = 'ℹ️';
        if (type === 'success') icon = '✅';
        if (type === 'error') icon = '❌';
        if (type === 'warning') icon = '⚠️';

        toast.innerHTML = `
            <div class="toast-icon">${icon}</div>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                <div class="toast-message">${message}</div>
            </div>
            <button class="btn-close" style="font-size: 1rem;">&times;</button>
        `;
        this.ui.toastContainer.appendChild(toast);
        
        const closeBtn = toast.querySelector('.btn-close');
        if (closeBtn) closeBtn.onclick = () => toast.remove();
        
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    },

    copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            this.showToast('success', 'Copied!', 'Link copied to clipboard', 2000);
        }).catch(err => {
            this.showToast('error', 'Error', 'Failed to copy text', 2000);
        });
    },

    updateDashboardStats(stats) {
        if (!stats) return;
        if (this.ui.uniqueClicksCount) {
            this.ui.uniqueClicksCount.textContent = (stats.uniqueClicks || 0).toLocaleString();
        }
        if (this.ui.conversionRate) {
            this.ui.conversionRate.textContent = (stats.conversionRate || 0) + '%';
        }
        if (this.ui.topCountryDisplay) {
            const top = stats.topCountries && stats.topCountries[0];
            this.ui.topCountryDisplay.textContent = top ? `${top.country} (${top.count})` : '—';
        }
    },

    async searchLinks() {
        const query = this.ui.linkSearchInput.value.trim();
        if (!query) {
            this.renderLinksTable();
            return;
        }
        try {
            const results = await this.handleApiCall(`/api/links/search?q=${encodeURIComponent(query)}`);
            this.renderLinksTableWithData(results || []);
        } catch (err) {
            console.error('Search failed:', err);
        }
    },

    renderLinksTableWithData(links) {
        this.ui.linksTbody.innerHTML = '';
        const hasLinks = links.length > 0;
        this.ui.noLinksMessage.style.display = hasLinks ? 'none' : 'block';
        if (!hasLinks) return;
        links.forEach(link => {
            const tr = this._createLinkRow(link);
            this.ui.linksTbody.appendChild(tr);
        });
    },

    async exportClicks() {
        try {
            const data = await this.handleApiCall('/api/stats/export?days=30');
            if (!data || data.length === 0) {
                this.showToast('info', 'No Data', 'No click data to export.');
                return;
            }
            // Convert to CSV
            const headers = ['timestamp', 'linkId', 'isBot', 'country', 'referrer', 'ipAddress', 'userAgent', 'destinationUrl', 'isUnique', 'tags', 'notes'];
            const csvRows = [headers.join(',')];
            data.forEach(row => {
                const values = headers.map(h => {
                    const val = row[h] !== undefined && row[h] !== null ? String(row[h]) : '';
                    return '"' + val.replace(/"/g, '""') + '"';
                });
                csvRows.push(values.join(','));
            });
            const csvContent = csvRows.join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `paris-engine-export-${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
            URL.revokeObjectURL(url);
            this.showToast('success', 'Exported!', `${data.length} records exported to CSV.`);
        } catch (err) {
            this.showToast('error', 'Export Failed', err.message);
        }
    },

    toggleSelectAllLinks(checked) {
        const checkboxes = this.ui.linksTbody.querySelectorAll('.link-select-cb');
        checkboxes.forEach(cb => { cb.checked = checked; });
        this.updateBulkDeleteVisibility();
    },

    updateBulkDeleteVisibility() {
        const checked = this.ui.linksTbody.querySelectorAll('.link-select-cb:checked');
        if (this.ui.bulkDeleteBtn) {
            this.ui.bulkDeleteBtn.style.display = checked.length > 0 ? '' : 'none';
        }
    },

    async bulkDeleteLinks() {
        const checked = this.ui.linksTbody.querySelectorAll('.link-select-cb:checked');
        const ids = Array.from(checked).map(cb => cb.dataset.id);
        if (ids.length === 0) return;
        if (!confirm(`Are you sure you want to delete ${ids.length} link(s)? This action is permanent.`)) return;
        try {
            const result = await this.handleApiCall('/api/links/bulk-delete', {
                method: 'POST',
                body: JSON.stringify({ linkIds: ids })
            });
            this.links = this.links.filter(l => !ids.includes(l.id));
            this.updateStats();
            this.renderLinksTable();
            if (this.ui.selectAllLinks) this.ui.selectAllLinks.checked = false;
            this.showToast('success', 'Deleted', `${result.deleted} link(s) deleted successfully.`);
        } catch (err) {
            this.showToast('error', 'Error', err.message);
        }
    },

    async updateLinkTags(linkId, tags) {
        try {
            await this.handleApiCall(`/api/links/${linkId}`, {
                method: 'PATCH',
                body: JSON.stringify({ tags })
            });
            const link = this.links.find(l => l.id === linkId);
            if (link) link.tags = tags;
            this.showToast('success', 'Updated', 'Link tags updated.');
        } catch (err) {
            this.showToast('error', 'Error', err.message);
        }
    },

    // ==================== NEW FEATURE METHODS ====================

    updateRateSummary(data) {
        if (!data) return;
        if (this.ui.rateTodayHuman) this.ui.rateTodayHuman.textContent = (data.today?.human || 0).toLocaleString();
        if (this.ui.rateTodayBot) this.ui.rateTodayBot.textContent = (data.today?.bot || 0).toLocaleString();
        if (this.ui.rateTodayTotal) this.ui.rateTodayTotal.textContent = (data.today?.total || 0).toLocaleString();
        if (this.ui.rateWeekHuman) this.ui.rateWeekHuman.textContent = (data.thisWeek?.human || 0).toLocaleString();
        if (this.ui.rateWeekBot) this.ui.rateWeekBot.textContent = (data.thisWeek?.bot || 0).toLocaleString();
        if (this.ui.rateWeekTotal) this.ui.rateWeekTotal.textContent = (data.thisWeek?.total || 0).toLocaleString();
        if (this.ui.rateMonthHuman) this.ui.rateMonthHuman.textContent = (data.thisMonth?.human || 0).toLocaleString();
        if (this.ui.rateMonthBot) this.ui.rateMonthBot.textContent = (data.thisMonth?.bot || 0).toLocaleString();
        if (this.ui.rateMonthTotal) this.ui.rateMonthTotal.textContent = (data.thisMonth?.total || 0).toLocaleString();
    },

    renderGeoSummary(data) {
        if (!this.ui.geoSummaryBody) return;
        if (!data || data.length === 0) {
            this.ui.geoSummaryBody.innerHTML = '<div class="empty-state-sm">No geographic data yet.</div>';
            return;
        }
        let html = '<div class="geo-list">';
        data.forEach((item, i) => {
            html += `
                <div class="geo-row">
                    <span class="geo-rank">${i + 1}</span>
                    <span class="geo-country">${item.country}</span>
                    <div class="geo-bar-wrapper">
                        <div class="geo-bar" style="width: ${item.percentage}%"></div>
                    </div>
                    <span class="geo-count">${item.count}</span>
                    <span class="geo-pct">${item.percentage}%</span>
                </div>`;
        });
        html += '</div>';
        this.ui.geoSummaryBody.innerHTML = html;
    },

    renderTopLinks(data) {
        if (!this.ui.topLinksBody) return;
        if (!data || data.length === 0) {
            this.ui.topLinksBody.innerHTML = '<div class="empty-state-sm">No link data yet.</div>';
            return;
        }
        let html = '<div class="top-links-list">';
        data.forEach((link, i) => {
            const dest = link.destinationUrlDesktop || '—';
            const shortDest = dest.length > 40 ? dest.substring(0, 40) + '...' : dest;
            html += `
                <div class="top-link-row">
                    <span class="top-link-rank">#${i + 1}</span>
                    <div class="top-link-info">
                        <span class="top-link-url" title="${dest}">${shortDest}</span>
                        <span class="top-link-meta">${(link.humanClicks || 0)} human · ${(link.botClicks || 0)} bot</span>
                    </div>
                    <span class="top-link-total">${(link.totalClicks || 0)}</span>
                </div>`;
        });
        html += '</div>';
        this.ui.topLinksBody.innerHTML = html;
    },

    renderHourlyChart(data) {
        if (typeof Chart === 'undefined') return;
        if (!this.ui.hourlyChartCanvas) return;
        if (this.charts.hourly) this.charts.hourly.destroy();
        if (!data || data.length === 0) return;
        const labels = data.map(d => {
            const h = d.hour || '';
            try {
                const dt = new Date(h);
                return dt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
            } catch (e) { return h; }
        });
        const humanData = data.map(d => d.humanClicks || 0);
        const botData = data.map(d => d.botClicks || 0);
        this.charts.hourly = new Chart(this.ui.hourlyChartCanvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: 'Human', data: humanData, backgroundColor: 'rgba(34, 197, 94, 0.6)', borderColor: '#22c55e', borderWidth: 1 },
                    { label: 'Bot', data: botData, backgroundColor: 'rgba(245, 158, 11, 0.6)', borderColor: '#f59e0b', borderWidth: 1 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, stacked: true, ticks: { color: '#94a3b8', precision: 0 }, grid: { color: 'rgba(148, 163, 184, 0.1)' } },
                    x: { stacked: true, ticks: { color: '#94a3b8', maxTicksLimit: 12 }, grid: { display: false } }
                },
                plugins: {
                    legend: { display: true, labels: { color: '#94a3b8' } },
                    tooltip: { backgroundColor: '#1e293b', titleColor: '#f1f5f9', bodyColor: '#94a3b8', borderColor: '#334155', borderWidth: 1, padding: 12, cornerRadius: 8 }
                }
            }
        });
    },

    updateUserProfile(data) {
        if (!data) return;
        if (this.ui.usernameDisplay) this.ui.usernameDisplay.textContent = data.email || 'User';
        if (this.ui.userAvatar) this.ui.userAvatar.textContent = (data.email || 'U').charAt(0).toUpperCase();
        if (this.ui.userRoleDisplay) this.ui.userRoleDisplay.textContent = data.role === 'admin' ? 'Administrator' : 'User';
        if (this.ui.userSinceDisplay && data.createdAt) {
            this.ui.userSinceDisplay.textContent = 'Since ' + new Date(data.createdAt).toLocaleDateString();
        }
    },

    async toggleLinkStatus(linkId, currentlyActive) {
        const newStatus = !currentlyActive;
        try {
            await this.handleApiCall(`/api/links/${linkId}/status`, {
                method: 'PATCH',
                body: JSON.stringify({ active: newStatus })
            });
            const link = this.links.find(l => l.id === linkId);
            if (link) link.isActive = newStatus ? 1 : 0;
            this.renderLinksTable();
            this.showToast('success', newStatus ? 'Link Resumed' : 'Link Paused', newStatus ? 'Link is now active.' : 'Link is now paused.');
        } catch (err) {
            this.showToast('error', 'Error', err.message);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    app.init();
});
