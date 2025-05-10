import React, { useState } from 'react';
import axios from "axios";

const ProductCatalogueAForm = () => {
  const [form, setForm] = useState({
    title: '',
    description: '',
    price: '',
    location: '',
    images: [],
  });

  const CREATE_PRODUCT_API_KEY = "https://campusbuy-backend.onrender.com/postcataloguea";
  const UPLOAD_IMAGES_API_KEY = "https://campusbuy-backend.onrender.com/putcataloguea";

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleImageChange = (e) => {
    const files = Array.from(e.target.files).slice(0, 4); // Limit to 4 images
    setForm((prev) => ({
      ...prev,
      images: files,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (form.images.length === 0) {
      alert('No image selected. Please add at least one image.');
      return;
    }

    try {
      // Submit form data
      const { title, description, price, location } = form;
      const productRes = await axios.post(CREATE_PRODUCT_API_KEY, {
        title, description, price, location
      });

      // Upload images
      const formData = new FormData();
      form.images.forEach((image) => {
        formData.append('images', image);
      });

      await axios.put(`${UPLOAD_IMAGES_API_KEY}/${productRes.data._id}`, formData);

      alert('Product Created Successfully');
      setForm({
        title: '',
        description: '',
        price: '',
        location: '',
        images: [],
      });
    } catch (error) {
      console.error(error);
      if (error.response?.status === 400) {
        alert('WRONG IMAGE FORMAT: only jpg, jpeg, png, and svg formats allowed');
      } else {
        alert('Connection problems. Please refresh your network');
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl p-8 space-y-6">
        <div className="text-center">
          <h1 className="text-4xl font-extrabold text-indigo-700">PRODUCT CATALOGUE A</h1>
          <p className="text-sm text-gray-600 mt-2">
            Please put details of each product to create a product.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {['title', 'price', 'location'].map((field) => (
            <input
              key={field}
              type={field === 'price' ? 'number' : 'text'}
              name={field}
              placeholder={field.charAt(0).toUpperCase() + field.slice(1)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
              value={form[field]}
              onChange={handleChange}
              required
            />
          ))}

          <textarea
            name="description"
            placeholder="Description"
            rows="3"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
            value={form.description}
            onChange={handleChange}
          />

          <div>
            <label className="block mb-2 text-sm font-medium text-gray-700">
              Upload up to 4 Images
            </label>
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.svg"
              multiple
              onChange={handleImageChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none"
            />
            <p className="text-xs text-red-600 mt-1">
              Only JPG, JPEG, PNG and SVG files allowed.
            </p>
          </div>

          <button
            type="submit"
            className="w-full bg-indigo-600 text-white py-3 rounded-lg hover:bg-indigo-700 transition font-medium tracking-wide"
          >
            Create Product
          </button>
        </form>
      </div>
    </div>
  );
};

export default ProductCatalogueAForm;
