import { Mina, Field, AccountUpdate } from "o1js";

const getDynamicField = (obj: any, field: string): any => {
    return obj[field] !== undefined ? obj[field] : null;
}

const getFieldSafely = (obj: any, fieldName: string) => {
    try {
        return obj(fieldName)
    } catch (e) {
        return undefined
    }
}

const serializeDynamicNode = (node: any, path: string = ''): any => {
    const serializedNode: any = { path };
    for (const key in node) {
        const value = getDynamicField(node, key);

        if (Array.isArray(value)) {
            serializedNode[key] = value.map((child, index) =>
                typeof child === 'object' ? serializeDynamicNode(child, `${path}/${key}[${index}]`) : child
            );
        } else if (typeof value === 'object' && value !== null) {
            serializedNode[key] = serializeDynamicNode(value, `${path}/${key}`);
        } else {
            serializedNode[key] = value;
        }
    }

    if (node.children && Array.isArray(node.children)) {
        serializedNode.children = node.children.map((child: any, index: any) =>
            serializeDynamicNode(child, `${path}/children[${index}]`)
        );
    } else {
        serializedNode.children = [];
    }

    return serializedNode;
}

const serializeDynamicTree = (rootUpdates: any[]): any[] => {
    return rootUpdates.map((update, index) => serializeDynamicNode(update, `accountUpdate[${index}]`));
}

export const txnToDynamicJSON = (txn: any): any => {
    const accountUpdates = txn.transaction.accountUpdates || [];
    return {
        transactionType: txn.transactionType || "unknown",
        accountUpdates: serializeDynamicTree(accountUpdates),
    };
}