// 兼容新旧前端：新版通过 window.comfyAPI 暴露 app，旧版没有该对象时直接跳过，
// 避免扩展加载报错影响节点列表显示。
const app = window.comfyAPI?.app?.app;

if (app) {
app.registerExtension({
    name: "Kinako.ImageBatchSplitter",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "ImageBatchSplitter") {
            return;
        }

        nodeType.prototype.onNodeCreated = function () {
            this._type = "IMAGE";

            const updateOutputs = () => {
                if (!this.outputs) {
                    this.outputs = [];
                }
                const target = this.widgets.find(w => w.name === "out_count")["value"];
                const current = this.outputs.filter(o => o.type === this._type).length;

                if (target === current) return;

                if (target < current) {
                    for (let i = 0; i < current - target; i++) {
                        this.removeOutput(this.outputs.length - 1);
                    }
                } else {
                    for (let i = current + 1; i <= target; ++i) {
                        this.addOutput(`image_${i}`, this._type);
                    }
                }
            };

            this.addWidget("button", "Update outputs", null, updateOutputs);
            updateOutputs();
        };
    },
});
}
