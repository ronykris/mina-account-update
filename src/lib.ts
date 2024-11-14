import { Mina, Field, AccountUpdate } from "o1js";

const getDynamicField = (obj: any, field: string): any => {
    try {
        // First try to get the value directly
        let value = obj[field];
        
        // If it's an object, deeply serialize it
        if (typeof value === 'object' && value !== null) {
            return JSON.parse(JSON.stringify(value));
        }
        
        return value;
    } catch (e) {
        return null;
    }
}
const getFieldSafely = (obj: any, fieldName: string) => {
    try {
        return obj(fieldName)
    } catch (e) {
        return undefined
    }
}

const needsRecursiveSerialization = (value: any): boolean => {
    return value !== null && 
           typeof value === 'object' &&
           !(value instanceof Date) &&
           !(value instanceof RegExp) &&
           !(value instanceof Function);
}

const isSerializable = (value: any): boolean => {
    return (
        value === null ||
        typeof value === 'boolean' ||
        typeof value === 'number' ||
        typeof value === 'string' ||
        Array.isArray(value) ||
        (typeof value === 'object' && !(value instanceof Function))
    );
}

const serializeValue = (value: any, path: string): any => {
    if (!isSerializable(value)) {
        return null;
    }

    if (Array.isArray(value)) {
        return value.map((item, index) => 
            isSerializable(item) 
                ? serializeValue(item, `${path}[${index}]`)
                : null
        );
    }

    if (typeof value === 'object' && value !== null) {
        const serialized: any = {};
        for (const key in value) {
            const fieldValue = value[key];
            if (isSerializable(fieldValue)) {
                serialized[key] = serializeValue(fieldValue, `${path}.${key}`);
            }
        }
        return serialized;
    }

    return value;
}

const serializeDynamicNode = (node: any, path: string = ''): any => {
    if (!node || typeof node !== 'object') {
        return node;
    }

    const serializedNode: any = { path };

    // Process all properties except children
    for (const key in node) {
        if (key === 'children') continue;
        
        console.log(`Serializing key: ${key} at path: ${path}`);
        const value = getDynamicField(node, key);
        
        // Store the serialized value
        serializedNode[key] = value;
    }

    // Handle children array separately
    if (node.children && Array.isArray(node.children)) {
        serializedNode.children = node.children.map((child: any, index: number) =>
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
    try {
        const accountUpdates = txn.transaction.accountUpdates || [];
        const serialized = {
            transactionType: txn.transactionType || "unknown",
            accountUpdates: serializeDynamicTree(accountUpdates),
        };

        // Force deep serialization of the entire object
        return JSON.parse(JSON.stringify(serialized));
    } catch (e) {
        console.error('Error during serialization:', e);
        return null;
    }
}