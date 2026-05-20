module.exports = {
    /**
     * Compiles Hugo's address partial template into dynamic HTML safe for PocketBase templates.
     * 
     * @param {string} model - The Alpine.js model binding variable (e.g., 'shippingAddress')
     * @param {string} theme - The design theme ('light' or 'dark')
     * @param {string} lang - The translation language ('ko-kr' or 'en')
     * @returns {string} - The compiled HTML markup including Javascript logic
     */
    compile: function(model, theme = "light", lang = "ko-kr") {
        let rawHtml = "";
        const filePath = `${__hooks}/../hugo/layouts/partials/form/address.html`;
        
        try {
            // Read binary bytes directly from the file to prevent Korean UTF-8 character corruption
            const bytes = $os.readFile(filePath);
            const binaryStr = Array.from(bytes).map(b => String.fromCharCode(b)).join('');
            rawHtml = decodeURIComponent(escape(binaryStr));
        } catch(err) {
            console.error("Failed to read address.html from JSVM compiler: " + err);
            // Fallback robust default template if file reading fails
            return `<div class="mb-4">
                <label class="block text-sm font-medium mb-2 uppercase tracking-wide text-gray-500">배송지 주소</label>
                <div class="flex gap-2">
                    <input type="text" x-model="${model}" class="flex-1 px-4 py-3 border border-gray-300 rounded-sm focus:outline-none focus:border-bmw-blue bg-white dark:bg-[#111] text-gray-900 dark:text-white" placeholder="검색할 주소를 입력하세요 (예: 판교역로 166)" />
                    <button type="button" @click="window.openKakaoPostcode(${model} || '', (result) => { ${model} = result; })" class="px-4 py-3 bg-gray-200 hover:bg-gray-300 transition text-sm font-medium rounded-sm">주소검색</button>
                </div>
            </div>`;
        }

        // 1. Calculate CSS class arrays based on theme matching Hugo's address.html logic
        let inputClass = "flex-1 px-4 py-3 focus:outline-none focus:border-bmw-blue transition ";
        let btnClass = "px-4 py-3 transition uppercase text-sm tracking-wider font-medium whitespace-nowrap ";
        let labelClass = "block text-sm mb-2 uppercase tracking-wide ";

        if (theme === "dark") {
            inputClass += "bg-[#111] border border-bmw-border text-white";
            btnClass += "bg-gray-800 text-gray-300 hover:bg-gray-700";
            labelClass += "text-gray-400";
        } else {
            inputClass += "bg-white dark:bg-[#111] border border-gray-300 dark:border-bmw-darkBorder text-gray-900 dark:text-white";
            btnClass += "bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-700";
            labelClass += "text-gray-500 dark:text-gray-400";
        }

        // 2. Select translations from Hugo matching current language context
        let addressLabel = "주소";
        if (lang === "en") {
            addressLabel = "Address";
        }

        let parsedHtml = rawHtml;

        // 3. Remove Hugo templates comments
        parsedHtml = parsedHtml.replace(/\{\{\/\*[\s\S]*?\*\/\}\}/g, "");

        // 4. Extract markup and scripts separately
        const divStartIndex = parsedHtml.indexOf("<div>");
        let mainMarkup = "";
        let scriptBlock = "";

        if (divStartIndex !== -1) {
            mainMarkup = parsedHtml.substring(divStartIndex);
            const scriptStartIndex = mainMarkup.indexOf("<script");
            if (scriptStartIndex !== -1) {
                scriptBlock = mainMarkup.substring(scriptStartIndex);
                mainMarkup = mainMarkup.substring(0, scriptStartIndex);
            }
        } else {
            mainMarkup = parsedHtml;
        }

        // 5. Clean up all Hugo-specific template tags inside script block globally
        scriptBlock = scriptBlock.replace(/\{\{[\s\S]*?\}\}/g, "");

        // 6. Perform placeholder replacements inside main markup
        // Replace styles
        mainMarkup = mainMarkup.replace(/\{\{\s*\$labelClass\s*\}\}/g, labelClass);
        mainMarkup = mainMarkup.replace(/\{\{\s*\$inputClass\s*\}\}/g, inputClass);
        mainMarkup = mainMarkup.replace(/\{\{\s*\$btnClass\s*\}\}/g, btnClass);
        
        // Replace translation
        mainMarkup = mainMarkup.replace(/\{\{\s*i18n\s+"address"\s*\}\}/g, addressLabel);
        
        // Replace model variables
        // Goja replace is safe with simple string models
        mainMarkup = mainMarkup.replace(/\{\{\s*\$model\s*\}\}/g, model);

        // Stitch markup and script block back together
        let compiled = mainMarkup + "\n" + scriptBlock;

        // 7. Remove any leftover Hugo/Go template curly braces {{ ... }} globally
        compiled = compiled.replace(/\{\{[\s\S]*?\}\}/g, "");

        return compiled;
    }
};
