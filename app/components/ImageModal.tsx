"use client";

import { motion } from "framer-motion";
import { X } from "lucide-react";

interface ImageModalProps {
    src: string;
    onClose: () => void;
}

const ImageModal: React.FC<ImageModalProps> = ({ src, onClose }) => (
    <motion.div
        className="fixed inset-0 z-[1000] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
    >
        <motion.div
            className="relative bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-4xl max-h-[90vh] w-full p-6"
            onClick={(e) => e.stopPropagation()}
            initial={{ scale: 0.9, y: 50, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 50, opacity: 0 }}
            transition={{ type: "spring", damping: 17, stiffness: 200 }}
        >
            <button
                onClick={onClose}
                className="absolute -top-4 -right-4 z-50 p-2 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-full shadow-lg hover:bg-red-500 hover:text-white transition-all"
                title="Закрити"
            >
                <X size={20} />
            </button>
            <img
                src={src}
                alt="Збільшене зображення товару"
                className="w-full h-full object-contain max-h-[calc(90vh-3rem)]"
            />
        </motion.div>
    </motion.div>
);

export default ImageModal;
